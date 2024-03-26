import {
  Dispatch,
  SetStateAction,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  createPXEClient,
  GrumpkinScalar,
  waitForPXE,
  AztecAddress,
  AccountWalletWithPrivateKey,
} from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { useSocket } from './SocketContext';
import { BaseStateChannel } from '@mach-34/aztec-statechannel-tictactoe';
import { PXE_URL, SERVER_URL } from 'utils/constants';
import { deserializeGame, getTimeout } from 'utils/game';
const { REACT_APP_API_URL: API_URL } = process.env;

// type Game = {
//   challenger: string;
//   host: string;
//   status: string;
//   id: string;
// };

type UserContextType = {
  wallet: AccountWalletWithPrivateKey | null;
  activeChannel: BaseStateChannel | null;
  activeGame: any;
  incrementNonce: () => void;
  initializeChannel: (game: any) => void;
  nonce: number;
  setActiveChannel: Dispatch<SetStateAction<BaseStateChannel | null>>;
  setActiveGame: Dispatch<SetStateAction<any>>;
  signIn: (key: string) => Promise<void>;
  contract: AztecAddress | null;
  signingIn: boolean;
  signedIn: boolean;
};

const UserContext = createContext<UserContextType>({
  wallet: null,
  activeChannel: null,
  activeGame: null,
  incrementNonce: () => null,
  initializeChannel: () => null,
  nonce: 0,
  setActiveChannel: () => { },
  setActiveGame: () => { },
  signIn: async (_key: string) => { },
  contract: null,
  signingIn: false,
  signedIn: false,
});

export const UserProvider: React.FC<{ children: JSX.Element }> = ({
  children,
}) => {
  const socket = useSocket();

  // const { REACT_APP_API_KEY } = process.env;
  const [activeChannel, setActiveChannel] = useState<BaseStateChannel | null>(
    null
  );
  const [activeGame, setActiveGame] = useState<any>(null);
  const [nonce, setNonce] = useState(0);
  const [wallet, setWallet] = useState<AccountWalletWithPrivateKey | null>(
    null
  );
  const [signingIn, setSigningIn] = useState(false);
  const [contract, setContract] = useState<AztecAddress | null>(null);

  const incrementNonce = () => {
    setNonce((prev) => prev + 1);
  };

  const initializeChannel = (game: any) => {
    if (!wallet || !contract) return;
    // Restore channel
    // todo: replace with state channel
    const channel = new BaseStateChannel(
      wallet,
      contract,
      BigInt(game.gameId),
    );

    channel.openChannelResult = game.executionResults.open;
    channel.orchestratorResult = game.executionResults.orchestrator;
    channel.turnResults = game.executionResults.turn;
    setActiveChannel(channel);
  };

  // Get current nonce
  const signIn = async (key: string) => {
    setSigningIn(true);

    // Connect to PXE
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);

    // Instantiate Grumpkin Account
    const grumpkin = GrumpkinScalar.fromString(key);
    const account = getSchnorrAccount(pxe, grumpkin, grumpkin, 100n);
    const { address } = account.getCompleteAddress();

    // check if account wallet exists in pxe
    let wallet: AccountWalletWithPrivateKey;
    const accountInPXE = await pxe.getExtendedContractData(address);
    if (accountInPXE === undefined) {
      // attempt to deploy the account
      try {
        await account.deploy().then(async (res) => await res.wait());
      } catch (e) {
        // probably already deployed
        console.log("Account already deployed");
      }
      // register the account in the PXE
      wallet = await account.register();
    } else {
      wallet = await account.getWallet();
    }

    // login to the server
    const res = await fetch(`${API_URL}/user/nonce`, {
      headers: {
        'X-Address': address.toString(),
      },
    });
    const { nonce: nonceRes } = await res.json();

    // get contract address
    const { address: contractAddress } = await fetch(`${API_URL}/game/contract`).then(async (res) => await res.json());
    console.log("Got address: ", contractAddress);

    // set state
    setWallet(wallet);
    setNonce(nonceRes);
    setContract(AztecAddress.fromString(contractAddress));
    setSigningIn(false);
  };

  useEffect(() => {
    if (!wallet) return;
    (async () => {
      const res = await fetch(`${SERVER_URL}/game/in-game`, {
        headers: {
          'X-Address': wallet.getCompleteAddress().address.toString(),
        },
      });
      const data = await res.json();
      if (data.game) {
        const deserialized = deserializeGame(data.game);
        deserialized.timeout = getTimeout(data.game.gameId, wallet, contract);
        setActiveGame(deserialized);
        initializeChannel(deserialized);
      }
    })();
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !socket) return;

    const handleGameJoin = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleFinalizeTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleTimeoutTriggered = (data: any) => {
      const deserialized = deserializeGame(data);
      deserialized.timeout = getTimeout(deserialized.gameId, wallet, contract);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleSignOpen = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleSignOpponentTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    socket.on('game:join', handleGameJoin);
    socket.on('game:openChannel', handleSignOpen);
    socket.on('game:finalizeTurn', handleFinalizeTurn);
    socket.on('game:signOpponentTurn', handleSignOpponentTurn);
    socket.on('game:timeoutTriggered', handleTimeoutTriggered);
    socket.on('game:turn', handleTurn);

    // Clean up event listeners
    return () => {
      socket.off('game:join', handleGameJoin);
      socket.off('game:openChannel', handleSignOpen);
      socket.off('game:finalizeTurn', handleFinalizeTurn);
      socket.off('game:signOpponentTurn', handleSignOpponentTurn);
      socket.off('game:timeoutTriggered', handleTimeoutTriggered);
      socket.off('game:turn', handleTurn);
    };
  }, [wallet, setActiveGame, socket]);

  return (
    <UserContext.Provider
      value={{
        wallet,
        activeChannel,
        activeGame,
        incrementNonce,
        initializeChannel,
        nonce,
        setActiveChannel,
        setActiveGame,
        signIn,
        contract,
        signingIn,
        signedIn: !!wallet,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => useContext(UserContext);

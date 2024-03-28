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
import {
  BaseStateChannel,
  ContinuedStateChannel,
} from '@mach-34/aztec-statechannel-tictactoe';
import { PXE_URL } from 'utils/constants';
import { deserializeGame, getAztecGameState, getTimeout } from 'utils';
const { REACT_APP_API_URL: API_URL } = process.env;

// type Game = {
//   challenger: string;
//   host: string;
//   status: string;
//   id: string;
// };

export enum TTZSocketEvent {
  AnswerTimeout = 'game:answerTimeout',
  OpenChannel = 'game:openChannel',
  JoinGame = 'game:join',
  // @TODO: Come up with better name
  FinalizeTurn = 'game:finalizeTurn',
  StartGame = 'game:start',
  SignOpponentTurn = 'game:signOpponentTurn',
  SubmitGame = 'game:submit',
  TriggerTimeout = 'game:triggerTimeout',
  Turn = 'game:turn',
}

type StateChannel = BaseStateChannel | ContinuedStateChannel;

type UserContextType = {
  activeChannel: StateChannel | null;
  activeGame: any;
  contract: AztecAddress | null;
  initializeChannel: (game: any, startTurn?: number) => void;
  latestPostedTurn: number;
  setActiveGame: Dispatch<SetStateAction<any>>;
  setLatestPostedTurn: Dispatch<SetStateAction<number>>;
  signIn: (key: string) => Promise<void>;
  signingIn: boolean;
  signedIn: boolean;
  wallet: AccountWalletWithPrivateKey | null;
};

const UserContext = createContext<UserContextType>({
  activeChannel: null,
  activeGame: null,
  contract: null,
  initializeChannel: () => null,
  latestPostedTurn: -1,
  setActiveGame: () => {},
  setLatestPostedTurn: () => {},
  signIn: async (_key: string) => {},
  signingIn: false,
  signedIn: false,
  wallet: null,
});

export const UserProvider: React.FC<{ children: JSX.Element }> = ({
  children,
}) => {
  const socket = useSocket();

  // const { REACT_APP_API_KEY } = process.env;
  const [activeChannel, setActiveChannel] = useState<StateChannel | null>(null);
  const [activeGame, setActiveGame] = useState<any>(null);
  const [contract, setContract] = useState<AztecAddress | null>(null);
  const [latestPostedTurn, setLatestPostedTurn] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [wallet, setWallet] = useState<AccountWalletWithPrivateKey | null>(
    null
  );

  const initializeChannel = (game: any, startTurn?: number) => {
    if (!wallet || !contract) return;

    let channel = undefined;
    // Restore channel
    if (!startTurn) {
      channel = new BaseStateChannel(wallet, contract, BigInt(game.gameId));
      channel.openChannelResult = game.executionResults.open;
    } else {
      channel = new ContinuedStateChannel(
        wallet,
        contract,
        BigInt(game.gameId),
        startTurn
      );
    }
    const diff = game.turnIndex - game.executionResults.turn.length;
    channel.turnResults = game.executionResults.turn.slice(
      startTurn ? startTurn - diff : 0
    );
    setActiveChannel(channel);
  };

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
        console.log('Account already deployed');
      }
      // register the account in the PXE
      wallet = await account.register();
    } else {
      wallet = await account.getWallet();
    }

    // get contract address
    const { address: contractAddress } = await fetch(
      `${API_URL}/game/contract`
    ).then(async (res) => await res.json());
    console.log('Got address: ', contractAddress);

    // set state
    setWallet(wallet);
    setContract(AztecAddress.fromString(contractAddress));
    setSigningIn(false);
  };

  useEffect(() => {
    if (!contract || !wallet) return;
    (async () => {
      // TODO: Read from IndexedDB
      const res = await fetch(`${API_URL}/game/in-game`, {
        headers: {
          'X-Address': wallet.getCompleteAddress().address.toString(),
        },
      });
      const data = await res.json();
      if (data.game) {
        // Get latest game state posted onchain
        const latestPostedState = await getAztecGameState(
          data.game.gameId,
          wallet,
          contract
        );
        const lastStoredTurn = latestPostedState.turn;

        const deserialized = deserializeGame(data.game);
        deserialized.over = latestPostedState.over;
        deserialized.timeout = await getTimeout(
          data.game.gameId,
          wallet,
          contract
        );
        setActiveGame(deserialized);
        setLatestPostedTurn(Number(lastStoredTurn));
        initializeChannel(deserialized, Number(lastStoredTurn));
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

    const handleSubmittedGame = () => {
      setActiveGame((prev: any) => ({ ...prev, over: true, timeout: 0n }));
    };

    const handleFinalizeTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized, latestPostedTurn);
    };

    const handleTimeoutAnswered = async (data: any) => {
      if (!contract) return;
      const timeout = await getTimeout(activeGame.gameId, wallet, contract);
      const latestPostedState = await getAztecGameState(
        activeGame.gameId,
        wallet,
        contract
      );
      const lastStoredTurn = latestPostedState.turn;
      const deserialized = deserializeGame(data);
      deserialized.timeout = timeout;
      setActiveGame(deserialized);
      setLatestPostedTurn(Number(lastStoredTurn));
      initializeChannel(deserialized, Number(lastStoredTurn));
    };

    const handleTimeoutTriggered = async (data: any) => {
      if (!contract) return;
      const timeout = await getTimeout(activeGame.gameId, wallet, contract);
      const latestPostedState = await getAztecGameState(
        activeGame.gameId,
        wallet,
        contract
      );
      const lastStoredTurn = latestPostedState.turn;
      setLatestPostedTurn(Number(lastStoredTurn));
      if (data) {
        const deserialized = deserializeGame(data);
        deserialized.timeout = timeout;
        setActiveGame(deserialized);
        initializeChannel(deserialized, Number(lastStoredTurn));
      } else {
        setActiveGame((prev: any) => {
          initializeChannel(prev, Number(lastStoredTurn));
          return {
            ...prev,
            timeout,
          };
        });
      }
    };

    const handleSignOpen = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized);
    };

    const handleSignOpponentTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized, latestPostedTurn);
    };

    const handleTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
      initializeChannel(deserialized, latestPostedTurn);
    };

    socket.on(TTZSocketEvent.JoinGame, handleGameJoin);
    socket.on(TTZSocketEvent.OpenChannel, handleSignOpen);
    socket.on(TTZSocketEvent.FinalizeTurn, handleFinalizeTurn);
    socket.on(TTZSocketEvent.SubmitGame, handleSubmittedGame);
    socket.on(TTZSocketEvent.SignOpponentTurn, handleSignOpponentTurn);
    socket.on(TTZSocketEvent.AnswerTimeout, handleTimeoutAnswered);
    socket.on(TTZSocketEvent.TriggerTimeout, handleTimeoutTriggered);
    socket.on(TTZSocketEvent.Turn, handleTurn);

    // Clean up event listeners
    return () => {
      socket.off(TTZSocketEvent.JoinGame, handleGameJoin);
      socket.off(TTZSocketEvent.OpenChannel, handleSignOpen);
      socket.off(TTZSocketEvent.FinalizeTurn, handleFinalizeTurn);
      socket.on(TTZSocketEvent.SubmitGame, handleSubmittedGame);
      socket.off(TTZSocketEvent.SignOpponentTurn, handleSignOpponentTurn);
      socket.off(TTZSocketEvent.AnswerTimeout, handleTimeoutAnswered);
      socket.off(TTZSocketEvent.TriggerTimeout, handleTimeoutTriggered);
      socket.off(TTZSocketEvent.Turn, handleTurn);
    };
  }, [activeGame, latestPostedTurn, wallet, setActiveGame, socket]);

  return (
    <UserContext.Provider
      value={{
        wallet,
        activeChannel,
        activeGame,
        initializeChannel,
        latestPostedTurn,
        setActiveGame,
        setLatestPostedTurn,
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

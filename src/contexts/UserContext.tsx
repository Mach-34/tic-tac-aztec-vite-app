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
import {
  deserializeGame,
  deserializeGameTodo,
  deserializeOpenChannel,
  gameKey,
  getAztecGameState,
  getTimeout,
  storeGame,
} from 'utils';
import { Game, JoinGameResponse, SerializedGame } from 'utils/types';
import _ from 'lodash';
const { REACT_APP_API_URL: API_URL } = process.env;

export type StateChannel = BaseStateChannel | ContinuedStateChannel;

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

type UserContextType = {
  activeGame: any;
  contract: AztecAddress | null;
  latestPostedTurn: number;
  setActiveGame: Dispatch<SetStateAction<any>>;
  setLatestPostedTurn: Dispatch<SetStateAction<number>>;
  signIn: (key: string) => Promise<void>;
  signingIn: boolean;
  signedIn: boolean;
  wallet: AccountWalletWithPrivateKey | null;
};

const UserContext = createContext<UserContextType>({
  activeGame: null,
  contract: null,
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
  const [activeGame, setActiveGame] = useState<any>(null);
  const [contract, setContract] = useState<AztecAddress | null>(null);
  const [latestPostedTurn, setLatestPostedTurn] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [wallet, setWallet] = useState<AccountWalletWithPrivateKey | null>(
    null
  );

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
      const serializedGame = localStorage.getItem(gameKey(wallet.getAddress()));
      if (serializedGame) {
        const game: Game = deserializeGameTodo(
          JSON.parse(serializedGame) as SerializedGame,
          wallet,
          contract
        );
        // Check if updated data has been posted onchain in case of timeout
        if (game.id) {
          const latestPostedState = await getAztecGameState(
            game.id,
            wallet,
            contract
          );
          game.lastPostedTurn = Number(latestPostedState.turn);
          game.over = latestPostedState.over;
          game.timeout = await getTimeout(game.id, wallet, contract);
        }
        setActiveGame(game);
      }
    })();
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !socket) return;

    const handleGameJoin = (data: JoinGameResponse) => {
      setActiveGame((prev: Game) => {
        const clone = _.cloneDeep(prev);
        clone.challenger = AztecAddress.fromString(data.address);
        clone.id = data.id;
        clone.challengerOpenSignature = deserializeOpenChannel(data.signature);
        // Store updated game state locally
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleSubmittedGame = () => {
      setActiveGame((prev: any) => ({ ...prev, over: true, timeout: 0n }));
    };

    const handleFinalizeTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
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
      } else {
        setActiveGame((prev: any) => {
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
    };

    const handleSignOpponentTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
    };

    const handleTurn = (data: any) => {
      const deserialized = deserializeGame(data);
      setActiveGame(deserialized);
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
        activeGame,
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

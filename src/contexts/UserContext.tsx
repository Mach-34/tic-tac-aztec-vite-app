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
  cloneGame,
  deserializeGame,
  deserializeOpenChannel,
  gameKey,
  getAztecGameState,
  getTimeout,
  initNewGame,
  storeGame,
} from 'utils';
import {
  AnswerTimeoutResponse,
  FinalTurnResponse,
  Game,
  JoinGameResponse,
  OpenChannelResponse,
  SerializedGame,
  SignTurnResponse,
  TriggerTimeoutResponse,
  TurnResponse,
} from 'utils/types';
import { AppExecutionResult } from '@aztec/circuit-types';
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
  activeGame: Game;
  contract: AztecAddress | null;
  setActiveGame: Dispatch<SetStateAction<Game>>;
  signIn: (key: string) => Promise<void>;
  signingIn: boolean;
  signedIn: boolean;
  wallet: AccountWalletWithPrivateKey | null;
};

const UserContext = createContext<UserContextType>({
  activeGame: initNewGame(),
  contract: null,
  setActiveGame: () => {},
  signIn: async (_key: string) => {},
  signingIn: false,
  signedIn: false,
  wallet: null,
});

export const UserProvider: React.FC<{ children: JSX.Element }> = ({
  children,
}) => {
  const socket = useSocket();

  const [activeGame, setActiveGame] = useState<any>(null);
  const [contract, setContract] = useState<AztecAddress | null>(null);
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
        const game: Game = deserializeGame(
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
          game.timeout = Number(await getTimeout(game.id, wallet, contract));
        }
        setActiveGame(game);
      }
    })();
  }, [wallet]);

  useEffect(() => {
    if (!contract || !socket || !wallet) return;

    const handleGameJoin = (data: JoinGameResponse) => {
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        clone.channel = new BaseStateChannel(wallet, contract, BigInt(data.id));
        clone.challenger = AztecAddress.fromString(data.address);
        clone.id = data.id;
        clone.challengerOpenSignature = deserializeOpenChannel(data.signature);
        // Store updated game state locally
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleSubmittedGame = () => {
      setActiveGame((prev: any) => {
        const clone = cloneGame(prev);
        clone.over = true;
        return clone;
      });
    };

    const handleFinalizeTurn = ({ turnResult }: FinalTurnResponse) => {
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        clone.channel?.insertTurn(AppExecutionResult.fromJSON(turnResult));
        clone.turnIndex += 1;
        // Update locally stored game
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleTimeoutAnswered = async (data: AnswerTimeoutResponse) => {
      const { turn } = data;
      if (!contract) return;
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        const lastPostedTurn = clone.lastPostedTurn + 1;

        clone.channel = new ContinuedStateChannel(
          wallet,
          contract,
          BigInt(clone.id),
          lastPostedTurn
        );
        clone.lastPostedTurn = lastPostedTurn;
        clone.turnIndex += 1;
        clone.turns.push(turn);
        clone.timeout = 0;
        // Update locally stored game
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleTimeoutTriggered = async (data: TriggerTimeoutResponse) => {
      if (!contract) return;
      const clone = cloneGame(activeGame);
      const timeout = await getTimeout(clone.id, wallet, contract);
      const latestPostedState = await getAztecGameState(
        clone.id,
        wallet,
        contract
      );

      clone.lastPostedTurn = Number(latestPostedState.turn);
      clone.timeout = Number(timeout);

      if (data.turnResult) {
        clone.channel?.insertTurn(AppExecutionResult.fromJSON(data.turnResult));
        clone.turnIndex += 1;
      }
      setActiveGame(clone);
      // Update locally stored version of game
      storeGame(clone, wallet.getAddress());
    };

    const handleSignOpen = ({ openChannelResult }: OpenChannelResponse) => {
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        const deserialized = AppExecutionResult.fromJSON(openChannelResult);
        (clone.channel as BaseStateChannel).openChannelResult = deserialized;
        // Update locally stored game
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleSignOpponentTurn = (data: SignTurnResponse) => {
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        clone.turns[clone.turnIndex].opponentSignature = data.signature;
        storeGame(clone, wallet.getAddress());
        return clone;
      });
    };

    const handleTurn = (data: TurnResponse) => {
      const { turn } = data;
      setActiveGame((prev: Game) => {
        const clone = cloneGame(prev);
        clone.turns.push(turn);
        // Update locally stored game
        storeGame(clone, wallet.getAddress());
        return clone;
      });
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
  }, [activeGame, wallet, setActiveGame, socket]);

  return (
    <UserContext.Provider
      value={{
        wallet,
        activeGame,
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

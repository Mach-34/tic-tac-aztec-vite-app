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
  Fr,
  waitForPXE,
  PXE,
  AztecAddress,
  Point,
} from '@aztec/aztec.js';
import { useSocket } from './SocketContext';
import { BaseStateChannel } from 'utils/baseChannel';
import { TIC_TAC_TOE_CONTRACT } from 'utils/constants';
import { deserializeGame } from 'utils/game';

// type Game = {
//   challenger: string;
//   host: string;
//   status: string;
//   id: string;
// };

type UserContextType = {
  address: string;
  activeChannel: BaseStateChannel | null;
  activeGame: any;
  incrementNonce: () => void;
  initializeChannel: (game: any) => void;
  // account: AccountWalletWithPrivateKey | null;
  nonce: number;
  pubkey: Point | null;
  privkey: GrumpkinScalar | null;
  pxe: PXE | null;
  setActiveChannel: Dispatch<SetStateAction<BaseStateChannel | null>>;
  setActiveGame: Dispatch<SetStateAction<any>>;
  signIn: (key: string) => Promise<void>;
  signingIn: boolean;
  signedIn: boolean;
};

const UserContext = createContext<UserContextType>({
  address: '',
  activeChannel: null,
  activeGame: null,
  incrementNonce: () => null,
  initializeChannel: () => null,
  nonce: 0,
  privkey: null,
  pubkey: null,
  pxe: null,
  setActiveChannel: () => {},
  setActiveGame: () => {},
  signIn: async (_key: string) => {},
  signingIn: false,
  signedIn: false,
});

export const UserProvider: React.FC<{ children: JSX.Element }> = ({
  children,
}) => {
  const socket = useSocket();

  // const { REACT_APP_API_KEY } = process.env;
  const [address, setAddress] = useState('');
  const [activeChannel, setActiveChannel] = useState<BaseStateChannel | null>(
    null
  );
  const [activeGame, setActiveGame] = useState<any>(null);
  const [nonce, setNonce] = useState(0);
  const [privkey, setPrivkey] = useState<GrumpkinScalar | null>(null);
  const [pubkey, setPubkey] = useState<Point | null>(null);
  const [pxe, setPxe] = useState<PXE | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const incrementNonce = () => {
    setNonce((prev) => prev + 1);
  };

  const initializeChannel = (game: any) => {
    if (!address || !privkey || !pxe) return;
    // Restore channel
    const channel = new BaseStateChannel(
      AztecAddress.fromString(address),
      privkey,
      AztecAddress.fromString(TIC_TAC_TOE_CONTRACT),
      // TODO: Change active game index
      1n,
      pxe
    );

    channel.openChannelResult = game.executionResults.open;
    channel.orchestratorResult = game.executionResults.orchestrator;
    channel.turnResults = game.executionResults.turn;
    setActiveChannel(channel);
  };

  // Get current nonce
  const signIn = async (key: string) => {
    setSigningIn(true);
    const grumpkin = GrumpkinScalar.fromString(key);

    // Test account creation
    const PXE_URL = 'http://localhost:8080';
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);
    const partialAddress = new Fr(100000n);
    const completeAddress = await pxe.registerAccount(grumpkin, partialAddress);
    const address = completeAddress.address.toString();
    const pubkey = completeAddress.publicKey;

    const res = await fetch(`http://localhost:8000/user/nonce`, {
      headers: {
        'X-Address': address,
      },
    });
    const { nonce: nonceRes } = await res.json();

    setAddress(address);
    setNonce(nonceRes);
    setPrivkey(grumpkin);
    setPubkey(pubkey);
    setPxe(pxe);
    setSigningIn(false);
  };

  useEffect(() => {
    if (!address || !privkey || !pxe) return;
    (async () => {
      const res = await fetch(`http://localhost:8000/game/in-game`, {
        headers: {
          'X-Address': address,
        },
      });
      const data = await res.json();
      if (data.game) {
        const deserialized = deserializeGame(data.game);
        setActiveGame(deserialized);
        initializeChannel(deserialized);
      }
    })();
  }, [address, privkey, pxe]);

  useEffect(() => {
    if (!privkey || !pxe || !socket) return;

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
    socket.on('game:turn', handleTurn);

    // Clean up event listeners
    return () => {
      socket.off('game:join', handleGameJoin);
      socket.off('game:openChannel', handleSignOpen);
      socket.off('game:finalizeTurn', handleFinalizeTurn);
      socket.off('game:signOpponentTurn', handleSignOpponentTurn);
      socket.off('game:turn', handleTurn);
    };
  }, [privkey, pxe, setActiveGame, socket]);

  return (
    <UserContext.Provider
      value={{
        address,
        activeChannel,
        activeGame,
        incrementNonce,
        initializeChannel,
        nonce,
        privkey,
        pubkey,
        pxe,
        setActiveChannel,
        setActiveGame,
        signIn,
        signingIn,
        signedIn: !!privkey,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => useContext(UserContext);

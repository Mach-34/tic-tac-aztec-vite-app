import Button from 'components/Button';
import MainLayout from '../../layouts/MainLayout';
import { Play } from 'lucide-react';
import { TTZSocketEvent, useUser } from 'contexts/UserContext';
import { useCallback, useEffect, useState } from 'react';
import { useSocket } from 'contexts/SocketContext';
import { useNavigate } from 'react-router-dom';
import { AztecAddress } from '@aztec/aztec.js';
import { BaseStateChannel } from '@mach-34/aztec-statechannel-tictactoe';
import {
  formatAztecAddress,
  genAztecId,
  initNewGame,
  serializeOpenChannel,
  storeGame,
} from 'utils';
import { SocketCallbackResponse, StartGameResponse } from 'utils/types';

const { REACT_APP_API_URL: API_URL } = process.env;

export default function Lobby(): JSX.Element {
  const { contract, setActiveGame, signedIn, wallet } = useUser();
  const socket = useSocket();
  const [games, setGames] = useState<string[]>([]);
  const navigate = useNavigate();

  const handleGameStart = useCallback(
    async (res: StartGameResponse) => {
      setGames((prev: string[]) => [...prev, res.address]);
    },
    [setGames]
  );

  const joinGame = async (opponent: string) => {
    if (!contract || !socket || !wallet) return;

    // get address
    const address = wallet.getAddress();

    // Sign open channel as guest
    const guestChannelOpenSignature = BaseStateChannel.signOpenChannel(
      wallet,
      AztecAddress.fromString(opponent),
      true
    );

    // Generate unique id
    const id = genAztecId(AztecAddress.fromString(opponent), address);

    // Initialize game state
    const game = initNewGame();
    game.channel = new BaseStateChannel(wallet, contract, BigInt(id));
    game.challenger = address;
    game.challengerOpenSignature = guestChannelOpenSignature;
    game.host = AztecAddress.fromString(opponent);
    game.id = id;

    socket.emit(
      TTZSocketEvent.JoinGame,
      {
        address: address.toString(),
        id,
        signature: serializeOpenChannel(guestChannelOpenSignature),
      },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          setActiveGame(game);
          // Store game state in local storage
          storeGame(game, address);
          setGames((prev) => prev.filter((host) => host === opponent));
          navigate('/game/pending');
        }
      }
    );
  };

  const getOpenGames = async () => {
    const res = await fetch(`${API_URL}/game/open`);
    const data = await res.json();
    setGames(data.map(({ host }: { host: string }) => host));
  };

  const startGame = async () => {
    if (!wallet || !socket) return;
    const address = wallet.getAddress();
    const game = initNewGame();
    game.host = address;

    // Emit start game event
    socket.emit(
      TTZSocketEvent.StartGame,
      { address: address.toString() },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          // Update global game state
          setActiveGame(game);

          // Store game locally
          storeGame(game, address);
          navigate('/game/pending');
        }
      }
    );
  };

  useEffect(() => {
    if (!socket) return;
    // Get pending games from db
    getOpenGames();

    // Listen for new games started
    socket.on(TTZSocketEvent.StartGame, handleGameStart);

    // Clean up event listeners
    return () => {
      socket.off(TTZSocketEvent.StartGame, handleGameStart);
    };
  }, [handleGameStart, socket]);

  return (
    <MainLayout>
      <div className='flex h-full justify-center'>
        <div className='text-center'>
          <div className='mt-10 text-4xl'>Open Games</div>
          <div className='mt-10 w-1/2'>
            {games
              .filter(
                (host: string) => host !== wallet?.getAddress().toString()
              )
              .map((host: string, index: number) => (
                <div className='flex items-center gap-2 mb-8' key={index}>
                  {formatAztecAddress(host)}
                  {signedIn && (
                    <Button onClick={() => joinGame(host)} text='Join' />
                  )}
                </div>
              ))}
          </div>
          {signedIn && (
            <Button Icon={Play} onClick={() => startGame()} text='Start game' />
          )}
        </div>
      </div>
    </MainLayout>
  );
}

import Button from 'components/Button';
import MainLayout from '../../layouts/MainLayout';
import { Play } from 'lucide-react';
import { useUser } from 'contexts/UserContext';
import { useCallback, useEffect, useState } from 'react';
import { useSocket } from 'contexts/SocketContext';
import { useNavigate } from 'react-router-dom';
import { BaseStateChannel } from 'utils/baseChannel';
import { AztecAddress } from '@aztec/aztec.js';
import { deserializeGame, genAztecId } from 'utils/game';

const { REACT_APP_API_URL: API_URL } = process.env;

export default function Lobby(): JSX.Element {
  const { wallet, initializeChannel, setActiveGame, signedIn } = useUser();
  const socket = useSocket();
  // TODO: Remove any
  const [games, setGames] = useState<any>([]);
  const navigate = useNavigate();

  const handleGameStart = useCallback(
    async (game: any) => {
      // TODO: Remove any
      setGames((prev: any) => [...prev, game]);
    },
    [setGames]
  );

  const joinGame = async (id: string, opponent: string) => {
    if (!wallet || !socket) return;

    // get address
    const address = wallet.getCompleteAddress().address;

    // Sign open channel as guest
    const guestChannelOpenSignature = BaseStateChannel.signOpenChannel(
      address,
      wallet.getEncryptionPrivateKey(),
      AztecAddress.fromString(opponent),
      true
    );

    const serializedSignature = {
      from: guestChannelOpenSignature.from.toString(),
      sig: [
        guestChannelOpenSignature.sig[0].toString(),
        guestChannelOpenSignature.sig[1].toString(),
        guestChannelOpenSignature.sig[2].toString(),
      ],
    };

    // Generate unique id
    // const gameId = genAztecId(AztecAddress.fromString(opponent), address);

    socket.emit(
      'game:join',
      { address, id, signature: serializedSignature },
      (res: any) => {
        if (res.status === 'success') {
          const deserialized = deserializeGame(res.game);
          setActiveGame(deserialized);
          initializeChannel(deserialized);
          navigate('/game/pending');
        }
      }
    );
  };

  const getPendingGames = async () => {
    const res = await fetch(`${API_URL}/game/pending`);
    const data = await res.json();
    setGames(data);
  };

  const startGame = async () => {
    if (!wallet || !socket) return;
    // Emit start game event
    socket.emit(
      'game:start',
      { address: wallet.getCompleteAddress().address.toString() },
      (res: any) => {
        if (res.status === 'success') {
          const deserialized = deserializeGame(res.game);
          setActiveGame(deserialized);
          initializeChannel(deserialized);
          // TODO: Figure out why this isn't working
          navigate('/game/pending');
        } else {
          // TODO: Handle error case
        }
      }
    );
  };

  useEffect(() => {
    if (!socket) return;
    // Get pending games from db
    getPendingGames();

    // Listen for new games started
    socket.on('game:start', handleGameStart);

    // Clean up event listeners
    return () => {
      socket.off('game:start', handleGameStart);
    };
  }, [handleGameStart, socket]);

  return (
    <MainLayout>
      <div className='flex h-full justify-center'>
        <div className='text-center'>
          <div className='mt-10 text-4xl'>Open Games</div>
          <div className='mt-10 w-1/2'>
            {/* TODO: Remove any */}
            {games
              .filter(
                (game: any) =>
                  game.host !== wallet?.getCompleteAddress().address.toString()
              )
              .map((game: any, index: number) => (
                <div className='flex items-center gap-2 mb-8' key={index}>
                  {game._id}
                  {signedIn && (
                    <Button
                      onClick={() => joinGame(game._id, game.host)}
                      text='Join'
                    />
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

import Button from 'components/Button';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Gamepad2, KeyRound, RefreshCcw, User } from 'lucide-react';
import Modal from 'components/Modal';
import { useMemo, useState } from 'react';
import { useUser } from 'contexts/UserContext';
import { GrumpkinScalar } from '@aztec/aztec.js';
import useCountdown from 'hooks/useCountdown';

export default function Header(): JSX.Element {
  const { pathname } = useLocation();
  const { activeGame, signIn, signedIn, signingIn } = useUser();
  const countdown = useCountdown(Number(activeGame?.timeout ?? 0));
  const [key, setKey] = useState('');
  const [showSignInModal, setShowSignInModal] = useState(false);

  const gameRoute = useMemo(() => {
    return pathname.includes('/game');
  }, [pathname]);

  const genGrumpkin = () => {
    setKey(GrumpkinScalar.random().toString());
  };

  const handleSignIn = async () => {
    await signIn(key);
    setShowSignInModal(false);
  };

  return (
    <div className='bg-[#2D2047] flex items-center justify-between p-4'>
      <Link className='text-3xl text-white' to='/lobby'>
        Tic·Tac·Aztec
      </Link>
      <div className='flex items-center'>
        {activeGame?.timeout > 0n && (
          <div className='bg-[#913DE5] bg-opacity-50 flex gap-2 items-center mr-4 px-2 rounded-xl'>
            {countdown.minutes}:{countdown.seconds}
            <Clock size={18} />
          </div>
        )}
        {!!activeGame && !gameRoute && (
          <Link
            className='border border-white bg-[#913DE5] bg-opacity-50 flex gap-2 items-center mr-4 px-2 rounded-full text-white'
            to='/game/pending'
          >
            Back to game
            <Gamepad2 size={18} />
          </Link>
        )}
        <Button
          className='text-black'
          Icon={signedIn ? User : KeyRound}
          loading={signingIn}
          onClick={() => setShowSignInModal(true)}
          text={signedIn ? 'Signed in' : 'Sign in'}
        />
      </div>
      <Modal onClose={() => setShowSignInModal(false)} open={showSignInModal}>
        <div className='flex flex-col justify-center items-center gap-4 w-96'>
          <div className='flex items-center gap-2 ml-auto'>
            <div className='text-sm'>New Key</div>
            <RefreshCcw
              className='cursor-pointer'
              onClick={() => genGrumpkin()}
              size={16}
            />
          </div>
          <input
            className='w-full'
            onChange={(e) => setKey(e.target.value)}
            value={key}
          />
          <div>
            <Button
              loading={signingIn}
              onClick={() => handleSignIn()}
              text={signingIn ? 'Signing in' : 'Sign in'}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

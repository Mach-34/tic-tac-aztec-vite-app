import Button from 'components/Button';
import { Link, useLocation } from 'react-router-dom';
import { KeyRound, User } from 'lucide-react';
import Modal from 'components/Modal';
import { useState } from 'react';
import { useUser } from 'contexts/UserContext';
import { RefreshCcw } from 'lucide-react';
import { GrumpkinScalar } from '@aztec/aztec.js';
import useCountdown from 'hooks/useCountdown';

export default function Header(): JSX.Element {
  const { pathname } = useLocation();
  const { activeGame, signIn, signedIn, signingIn } = useUser();
  const countdown = useCountdown(Number(activeGame?.timeout ?? 0));
  const [key, setKey] = useState('');
  const [showSignInModal, setShowSignInModal] = useState(false);

  const genGrumpkin = () => {
    setKey(GrumpkinScalar.random().toString());
  };

  const handleSignIn = async () => {
    await signIn(key);
    setShowSignInModal(false);
  };

  console.log('Timestamp: ', activeGame?.timeout ?? 0);

  return (
    <div className='bg-[#2D2047] flex items-center justify-between p-4'>
      <Link className='text-3xl text-white' to='/lobby'>
        Tic-Tac-Aztec
      </Link>
      <div className='flex gap-2 items-center'>
        {!!activeGame && !pathname.includes('/game') && (
          <Link className='bg-red rounded text-white' to='/game/pending'>
            Go to game
          </Link>
        )}
        <Button
          className='border-white border text-black'
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

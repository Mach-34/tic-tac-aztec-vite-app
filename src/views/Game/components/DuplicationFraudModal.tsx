import Modal from 'components/Modal';
import { useState } from 'react';

type DuplicationFraudModalProps = {
  game: any;
  onClose: () => void;
  open: boolean;
};

export default function DuplicationFraudModal({
  game,
  onClose,
  open,
}: DuplicationFraudModalProps) {
  const [signatureOne, setSignatureOne] = useState('');
  const [signatureTwo, setSignatureTwo] = useState('');
  return (
    <Modal onClose={() => onClose()} open={open}>
      <div className='flex flex-col justify-center items-center gap-4 w-96'>
        Please provide evidence of two signatures for the same move for your
        opponent
      </div>
      <div className='my-2 text-xs'>Signature 1</div>
      <input
        className='w-full'
        onChange={(e) => setSignatureOne(e.target.value)}
        value={signatureOne}
      />
      <div className='my-2 text-xs'>Signature 2</div>
      <input
        className='w-full'
        onChange={(e) => setSignatureTwo(e.target.value)}
        value={signatureTwo}
      />
    </Modal>
  );
}

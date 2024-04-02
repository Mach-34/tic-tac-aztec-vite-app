import { ContinuedStateChannel } from '@mach-34/aztec-statechannel-tictactoe';
import { StateChannel } from 'contexts/UserContext';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { Turn } from 'utils/types';

enum StatusType {
  ActionRequired = 'actionRequired',
  Draw = 'draw',
  Lost = 'lost',
  Pending = 'pending',
  Waiting = 'waiting',
  Won = 'won',
}

type StatusBadgeProps = {
  answeringTimeout: boolean;
  challengerJoined: boolean;
  channel: StateChannel | undefined;
  currentTurn: Turn | undefined;
  finalizingTurn: boolean;
  gameOver: number;
  isHost: boolean;
  signingTurn: boolean;
  submitted: boolean;
  timeout: number;
  turnIndex: number;
  turns: Turn[];
};

export default function StatusBadge({
  answeringTimeout,
  channel,
  challengerJoined,
  currentTurn,
  finalizingTurn,
  gameOver,
  isHost,
  signingTurn,
  submitted,
  timeout,
  turnIndex,
  turns,
}: StatusBadgeProps): JSX.Element {
  const badgeColor: { [status: StatusType]: string } = {
    [StatusType.ActionRequired]: '#D63122',
    [StatusType.Draw]: '#DAE021',
    [StatusType.Lost]: '#D63122',
    [StatusType.Pending]: '#DAE021',
    [StatusType.Waiting]: '#47D822',
    [StatusType.Won]: '#47D822',
  };

  const msg: { status: StatusType; text: string } = useMemo(() => {
    const channelOpen =
      channel instanceof ContinuedStateChannel || !!channel?.openChannelResult;
    const isTurn = isHost ? turnIndex % 2 === 0 : turnIndex % 2 === 1;

    // Game over message
    if (gameOver) {
      const submitText = ' Please submit game to Aztec';
      const lossMessage = `Your opponent won the game.${
        !submitted ? submitText : ''
      }`;
      const winMessage = `You won the game!${!submitted ? submitText : ''}`;
      if (gameOver === 3) {
        return {
          status: submitted ? StatusType.Draw : StatusType.ActionRequired,
          text: `Game ended in draw.${!submitted ? submitText : ''}`,
        };
      } else if (gameOver === 2) {
        return isHost
          ? {
              status: submitted ? StatusType.Lost : StatusType.ActionRequired,
              text: lossMessage,
            }
          : {
              status: submitted ? StatusType.Won : StatusType.ActionRequired,
              text: winMessage,
            };
      } else {
        return isHost
          ? {
              status: submitted ? StatusType.Won : StatusType.ActionRequired,
              text: winMessage,
            }
          : {
              status: submitted ? StatusType.Lost : StatusType.ActionRequired,
              text: lossMessage,
            };
      }
    } else if (challengerJoined) {
      return {
        status: StatusType.Waiting,
        text: 'Waiting for opponent to join.',
      };
    } else if (!channelOpen) {
      if (isHost) {
        return {
          status: StatusType.ActionRequired,
          text: 'Opponent has joined. Please provide your signature to start the game',
        };
      } else {
        return {
          status: StatusType.Waiting,
          text: 'Waiting on host to sign channel open.',
        };
      }
    }

    // Check timeout
    else if (timeout > 0) {
      if (isTurn) {
        return {
          status: answeringTimeout
            ? StatusType.Pending
            : StatusType.ActionRequired,
          text: answeringTimeout
            ? 'Answering timeout...'
            : 'Your opponent has triggered a timeout against you. Please answer within the remaining time',
        };
      } else {
        return {
          status: StatusType.Waiting,
          text: 'Waiting for opponent to answer timeout',
        };
      }
    }

    // Check pending turn signature
    else if (currentTurn && !currentTurn.opponentSignature) {
      if (isTurn) {
        return {
          status: StatusType.Waiting,
          text: 'Waiting on opponent to sign move.',
        };
      } else {
        return {
          status: signingTurn ? StatusType.Pending : StatusType.ActionRequired,
          text: signingTurn
            ? 'Signing opponenet move'
            : `Please sign your opponent's move`,
        };
      }
    }
    // Check if turn is finalized
    else if (turnIndex !== turns.length) {
      if (isTurn) {
        return {
          status: finalizingTurn
            ? StatusType.Pending
            : StatusType.ActionRequired,
          text: finalizingTurn
            ? 'Finalizing turn'
            : 'Opponent signature provided. Please finalize your turn and generate execution result.',
        };
      } else {
        return {
          status: StatusType.Waiting,
          text: 'Waiting on opponent to finalize turn.',
        };
      }
    } else {
      if (isTurn) {
        return {
          status: StatusType.ActionRequired,
          text: 'Please take your turn.',
        };
      } else {
        return {
          status: StatusType.Waiting,
          text: 'Waiting on opponents turn.',
        };
      }
    }
  }, [
    answeringTimeout,
    channel,
    currentTurn,
    finalizingTurn,
    gameOver,
    isHost,
    signingTurn,
    submitted,
    timeout,
    turnIndex,
    turns,
  ]);

  return (
    <div
      className={`border border-[${badgeColor[msg.status]}] bg-[${
        badgeColor[msg.status]
      }] bg-opacity-50 flex items-center gap-2 px-2 rounded-full w-fit`}
    >
      {msg.text}
      {msg.status === StatusType.Pending && (
        <Loader2 className='animate-spin' size={18} />
      )}
    </div>
  );
}

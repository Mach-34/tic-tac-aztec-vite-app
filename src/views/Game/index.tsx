import { useEffect, useMemo, useState } from 'react';
import MainLayout from 'layouts/MainLayout';
import { Circle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from 'contexts/UserContext';
import Button from 'components/Button';
import { Move } from 'utils';
import { useSocket } from 'contexts/SocketContext';
import { AztecAddress } from '@aztec/circuits.js';
import { deserializeGame } from 'utils/game';
import { WINNING_PLACEMENTS } from 'utils/constants';
// import DuplicationFraudModal from './components/DuplicationFraudModal';

export default function Game(): JSX.Element {
  const socket = useSocket();
  const {
    wallet,
    activeChannel,
    activeGame,
    initializeChannel,
    setActiveGame,
    signingIn,
  } = useUser();
  const navigate = useNavigate();
  const [board, setBoard] = useState<number[]>([]);
  // const [showDuplicationModal, setShowDuplicationModal] = useState(false);
  const [showPiece, setShowPiece] = useState({ row: -1, col: -1 });
  const [triggeringTimeout, setTriggeringTimeout] = useState(false);
  // const [showSignatureModal, setShowSignatureModal] = useState(false);

  const checkWinningPlacement = () => {
    return WINNING_PLACEMENTS.some((placement: number[]) => {
      let total = 0;
      for (const pos of placement) {
        total += board[pos];
      }
      return total == 3 || total == 12;
    });
  };

  const constructBoard = () => {
    const board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    activeGame.turns.forEach((turn: any, index: number) => {
      const coord = turn.row * 3 + turn.col;
      board[coord] = index % 2 === 0 ? 1 : 4;
    });
    setBoard(board);
  };

  const canMove = useMemo(() => {
    if (!activeGame || !activeChannel?.openChannelResult) return false;
    const isHost =
      wallet?.getCompleteAddress().address.toString() === activeGame.host;

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    return isTurn && activeGame.turns.length === activeGame.turnIndex;
  }, [activeChannel, activeGame, wallet]);

  const isHost = useMemo(() => {
    if (!activeGame) return false;
    return wallet?.getCompleteAddress().address.toString() === activeGame.host;
  }, [activeGame]);

  const endCondition = useMemo(() => {
    if (!activeGame) return;
    const winningPlacement = checkWinningPlacement();
    if (winningPlacement) {
      return isHost;
    }
    return activeGame.turnIndex === 9;
  }, [activeGame, board, isHost]);

  const signOpponentTurn = async () => {
    if (!activeChannel || !wallet || !socket) return;
    const turn = activeGame.turns[activeGame.turnIndex];

    const move = new Move(
      AztecAddress.fromString(turn.sender),
      turn.row,
      turn.col,
      activeGame.turnIndex,
      BigInt(turn.gameId)
    );

    const signature = move.sign(wallet.getEncryptionPrivateKey());

    socket.emit(
      'game:signOpponentTurn',
      {
        id: activeGame._id,
        signature: signature.toString(),
        turnIndex: activeGame.turnIndex,
      },
      (res: any) => {
        if (res.status === 'success') {
          setActiveGame(deserializeGame(res.game));
        }
      }
    );
  };

  const actions = useMemo(() => {
    const arr = [];
    if (!activeChannel || !activeGame) return <></>;

    const currentTurn = activeGame.turns[activeGame.turnIndex];
    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    // Turn related actions

    if (endCondition) {
      arr.push(<Button onClick={() => submitGame()} text='Submit Game' />);
    } else if (
      isHost &&
      activeGame.challengerOpenSignature &&
      !activeChannel.openChannelResult
    ) {
      arr.push(<Button onClick={() => commence()} text='Sign Open Channel' />);
    } else {
      if (currentTurn) {
        if (!isTurn && !currentTurn.opponentSignature) {
          arr.push(
            <Button
              onClick={() => signOpponentTurn()}
              text='Sign Opponent Move'
            />
          );
        } else if (
          isTurn &&
          currentTurn.opponentSignature &&
          activeGame.turnIndex.length !== activeGame.turns.length
        ) {
          arr.push(
            <Button onClick={() => submitTurn()} text='Finalize Turn' />
          );
        }
      }
    }

    // Timeout related actions
    const waitingOnOpponentTurn =
      !isTurn && activeGame.turns.length === activeGame.turnIndex;
    const waitingOnOpponentFinalization =
      !isTurn &&
      !!currentTurn.opponentSignature &&
      activeGame.turnIndex !== activeGame.turns.length;
    if (waitingOnOpponentTurn || waitingOnOpponentFinalization) {
      arr.push(
        <Button
          loading={triggeringTimeout}
          onClick={() => triggerTimeout()}
          text={triggeringTimeout ? 'Triggering timeout' : 'Trigger timeout'}
        />
      );
    }

    return arr;
  }, [activeChannel, activeGame, endCondition, isHost, triggeringTimeout]);

  const commence = async () => {
    if (!activeChannel || !wallet || !socket) return;
    const { challengerOpenSignature } = activeGame;
    const openChannelResult = await activeChannel.openChannel(
      challengerOpenSignature
    );

    socket.emit(
      'game:openChannel',
      {
        id: activeGame._id,
        openChannelResult: openChannelResult.toJSON(),
      },
      (res: any) => {
        if (res.status === 'success') {
          const deserialized = deserializeGame(res.game);
          setActiveGame(deserialized);
          initializeChannel(deserialized);
        }
      }
    );
  };

  const statusMessage = useMemo(() => {
    if (!activeGame || !activeChannel) return '';

    const currentTurn = activeGame.turns[activeGame.turnIndex];
    const turnResults = activeGame.executionResults.turn;

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    // Text displayed when challenger needs to join game
    if (!activeGame.challenger) {
      return 'Waiting for opponent to join.';
    }

    // If two players join game but have not both signed to open a channel
    else if (!activeChannel.openChannelResult) {
      if (isHost) {
        return 'Opponent has joined game and signed channel open. Please provide your signature to start the game';
      } else {
        return 'Waiting on host to sign channel open.';
      }
    }

    // else if(endCondition >= 0) {
    //   if(endCondition === )
    // }

    // If opponent's move requires signature
    else if (currentTurn && !currentTurn.opponentSignature) {
      if (isTurn) {
        return 'Waiting on opponent to sign move.';
      } else {
        return `Please sign your opponent's move`;
      }
    }

    // Waiting for opponent to finalize turn
    else if (turnResults.length !== activeGame.turns.length) {
      if (isTurn) {
        return 'Opponent signature provided. Please finalize your turn and generate execution result.';
      } else {
        return 'Waiting on opponent to finalize turn.';
      }
    } else {
      if (isTurn) {
        return 'Please take your turn.';
      } else {
        return 'Waiting on opponents turn.';
      }
    }
  }, [activeChannel, activeGame, endCondition, isHost]);

  const handlePlacement = async (row: number, col: number) => {
    if (!activeChannel || !activeGame || !wallet || !socket) return;

    const move = activeChannel.buildMove(row, col);

    socket.emit(
      'game:turn',
      {
        id: activeGame._id,
        move: {
          sender: move.sender.toString(),
          row: move.row,
          col: move.col,
          turnIndex: move.turnIndex,
          gameId: activeGame.gameId,
        },
      },
      (res: any) => {
        if (res.status === 'success') {
          setActiveGame(deserializeGame(res.game));
          setShowPiece({ row: -1, col: -1 });
        }
      }
    );
  };

  const submitGame = async () => {
    if (!activeChannel) return;
    const receipt = await activeChannel.finalize();
    console.log('Receipt: ', receipt);
  };

  const submitTurn = async () => {
    if (!activeChannel || !socket) return;
    const turn = activeGame.turns[activeGame.turnIndex];

    const move = new Move(
      AztecAddress.fromString(turn.sender),
      turn.row,
      turn.col,
      activeGame.turnIndex,
      BigInt(turn.gameId)
    );

    const turnResult = await activeChannel.turn(move, turn.opponentSignature);
    socket.emit(
      'game:finalizeTurn',
      {
        id: activeGame._id,
        turnResult: turnResult.toJSON(),
      },
      (res: any) => {
        if (res.status === 'success') {
          setActiveGame(deserializeGame(res.game));
          setShowPiece({ row: -1, col: -1 });
        }
      }
    );
  };

  const triggerTimeout = async () => {
    if (!activeChannel) return;
    setTriggeringTimeout(true);
    await activeChannel.finalize();

    // Put websocket functionality here
  };

  useEffect(() => {
    // Kick back to lobby if not in game
    if (!signingIn && !activeGame) {
      navigate('/lobby');
    } else {
      constructBoard();
    }
  }, [activeGame, signingIn]);

  return (
    <MainLayout>
      <div className='flex items-center justify-between p-4'>
        <div>{statusMessage}</div>
        <div>{actions}</div>
        {/* <Button
          onClick={() => setShowDuplicationModal(true)}
          Icon={BookCopy}
          text='Prove Duplication Fraud'
        /> */}
      </div>
      <div className='flex flex-col items-center justify-center h-full gap-10'>
        <div>
          {[board.slice(0, 3), board.slice(3, 6), board.slice(6)].map(
            (row: Array<number>, rowIndex: number) => (
              <div className='flex gap-2 mt-2' key={rowIndex}>
                {row.map((val, colIndex) => {
                  const index = rowIndex * 3 + colIndex;
                  const occupied = val > 0;
                  const isHovering =
                    index === showPiece.row * 3 + showPiece.col;
                  return (
                    <div
                      className='bg-[#D4BFFC] flex items-center justify-center rounded w-24 h-24'
                      key={index}
                      onClick={() =>
                        !occupied &&
                        canMove &&
                        handlePlacement(rowIndex, colIndex)
                      }
                      onMouseEnter={() =>
                        !occupied &&
                        canMove &&
                        setShowPiece({ row: rowIndex, col: colIndex })
                      }
                      onMouseLeave={() => setShowPiece({ row: -1, col: -1 })}
                    >
                      {occupied &&
                        (val === 4 ? (
                          <Circle color='#2D2047' size={60} />
                        ) : (
                          <X color='#2D2047' size={60} />
                        ))}
                      {isHovering &&
                        (activeGame.host ===
                        wallet?.getCompleteAddress().address.toString() ? (
                          <X className='opacity-60' color='#2D2047' size={60} />
                        ) : (
                          <Circle
                            className='opacity-60'
                            color='#2D2047'
                            size={60}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
      {/* <DuplicationFraudModal
        game={activeGame}
        onClose={() => setShowDuplicationModal(false)}
        open={showDuplicationModal}
      /> */}
    </MainLayout>
  );
}

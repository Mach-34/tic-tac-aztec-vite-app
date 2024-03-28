import { useEffect, useMemo, useState } from 'react';
import MainLayout from 'layouts/MainLayout';
import { Circle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from 'contexts/UserContext';
import Button from 'components/Button';
import {
  BaseStateChannel,
  ContinuedStateChannel,
  Move,
} from '@mach-34/aztec-statechannel-tictactoe';
import { useSocket } from 'contexts/SocketContext';
import { AztecAddress } from '@aztec/circuits.js';
import {
  answerTimeout,
  deserializeGame,
  getTimeout,
  triggerManualTimeout,
} from 'utils';
import { WINNING_PLACEMENTS } from 'utils/constants';
// import DuplicationFraudModal from './components/DuplicationFraudModal';

export default function Game(): JSX.Element {
  const socket = useSocket();
  const {
    wallet,
    activeChannel,
    activeGame,
    initializeChannel,
    latestPostedTurn,
    setActiveGame,
    setLatestPostedTurn,
    signingIn,
    contract,
  } = useUser();
  const navigate = useNavigate();
  const [answeringTimeout, setAnsweringTimeout] = useState(false);
  const [board, setBoard] = useState<number[]>([]);
  // const [showDuplicationModal, setShowDuplicationModal] = useState(false);
  const [showPiece, setShowPiece] = useState({ row: -1, col: -1 });
  const [submittingGame, setSubmittingGame] = useState(false);
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
    const channelOpened =
      activeChannel instanceof ContinuedStateChannel ||
      activeChannel?.openChannelResult;
    if (answeringTimeout || !activeGame || !channelOpened) return false;
    const isHost =
      wallet?.getCompleteAddress().address.toString() === activeGame.host;

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    return isTurn && activeGame.turns.length === activeGame.turnIndex;
  }, [activeChannel, activeGame, answeringTimeout, wallet]);

  const isHost = useMemo(() => {
    if (!activeGame) return false;
    return wallet?.getCompleteAddress().address.toString() === activeGame.host;
  }, [activeGame]);

  const gameOver = useMemo(() => {
    if (!activeGame) return;

    const finalized = activeGame.turnIndex === activeGame.turns.length;
    const winningPlacement = checkWinningPlacement();
    if (finalized && winningPlacement) {
      // 1 for host, 2 for challenger
      return activeGame.turnIndex % 2 === 1 ? 1 : 2;
    }
    // If game is draw return 0
    return activeGame.turnIndex === 9 && finalized ? 3 : 0;
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

    const signature = move.sign(wallet);

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
    const arr: JSX.Element[] = [];
    if (!activeChannel || !activeGame) return <></>;

    const currentTurn = activeGame.turns[activeGame.turnIndex];

    const channelOpen =
      activeChannel instanceof ContinuedStateChannel ||
      !!activeChannel.openChannelResult;

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    const submitted = activeGame.over;

    // Turn related actions

    if (submitted) {
      return arr;
    }

    if (gameOver) {
      arr.push(
        <Button
          className='my-2'
          key='Submit Game'
          loading={submittingGame}
          onClick={() => submitGame()}
          text={submittingGame ? 'Submitting game...' : 'Submit game'}
        />
      );
    } else if (isHost && activeGame.challenger && !channelOpen) {
      arr.push(
        <Button
          className='my-2'
          key='Sign Open Channel'
          onClick={() => commence()}
          text='Sign Open Channel'
        />
      );
    }
    if (currentTurn) {
      if (!isTurn && !currentTurn.opponentSignature) {
        arr.push(
          <Button
            className='my-2'
            key='Sign Opponent Move'
            onClick={() => signOpponentTurn()}
            text='Sign Opponent Move'
          />
        );
      } else if (
        isTurn &&
        currentTurn.opponentSignature &&
        activeGame.turnIndex !== activeGame.turns.length
      ) {
        arr.push(
          <Button
            className='my-2'
            key='Finalize Turn'
            onClick={() => submitTurn()}
            text='Finalize Turn'
          />
        );
      }
    }

    if (!gameOver && channelOpen && activeGame.turns.length) {
      // Timeout related actions

      if (activeGame.timeout > 0n && isTurn) {
        arr.push(
          <Button
            className='my-2'
            key='Dispute Timeout'
            onClick={() => null}
            text='Dispute Timeout'
          />
        );
      } else {
        // Case where we're waiting on opponent to sign our own turn
        const waitingOnOpponentSignature =
          isTurn && currentTurn && !currentTurn.opponentSignature;

        // Case where we're waiting on opponent to take next turn
        const waitingOnOpponentTurn =
          !isTurn && activeGame.turnIndex === activeGame.turns.length;
        if (
          !activeGame.timeout &&
          (waitingOnOpponentSignature || waitingOnOpponentTurn)
        ) {
          arr.push(
            <Button
              className='my-2'
              key='Triggering Timeout'
              loading={triggeringTimeout}
              onClick={() => triggerTimeout()}
              text={
                triggeringTimeout ? 'Triggering timeout' : 'Trigger timeout'
              }
            />
          );
        }
      }
    }

    return arr;
  }, [
    activeChannel,
    activeGame,
    gameOver,
    isHost,
    submittingGame,
    triggeringTimeout,
  ]);

  const answerActiveTimeout = async (row: number, col: number) => {
    if (!contract || !socket || !wallet) return;
    setAnsweringTimeout(true);
    const previousBoard = board.slice();
    try {
      setBoard((prev) => {
        const coord = row * 3 + col;
        prev[coord] = activeGame.turnIndex % 2 === 0 ? 1 : 4;
        return prev;
      });
      await answerTimeout(activeGame.gameId, wallet, contract, row, col);
      socket.emit(
        'game:timeoutAnswered',
        {
          id: activeGame._id,
          move: {
            sender: wallet?.getCompleteAddress().address.toString(),
            row: row,
            col: col,
            turnIndex: activeGame.turnIndex,
            gameId: activeGame.gameId,
          },
        },
        async (res: any) => {
          if (res.status === 'success') {
            const deserialized = deserializeGame(res.game);
            deserialized.timout = await getTimeout(
              res.game.gameId,
              wallet,
              contract
            );
            setLatestPostedTurn(deserialized.turnIndex);
            setActiveGame(deserialized);
            initializeChannel(deserialized, deserialized.turnIndex);
          }
        }
      );
    } catch (err) {
      setBoard(previousBoard);
    } finally {
      setAnsweringTimeout(false);
    }
  };

  const commence = async () => {
    if (!(activeChannel instanceof BaseStateChannel) || !wallet || !socket)
      return;
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
          initializeChannel(deserialized, latestPostedTurn);
        }
      }
    );
  };

  const statusMessage = useMemo(() => {
    if (!activeGame || !activeChannel) return '';

    const channelOpen =
      activeChannel instanceof ContinuedStateChannel ||
      !!activeChannel.openChannelResult;
    const currentTurn = activeGame.turns[activeGame.turnIndex];

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    const submitted = activeGame.over;

    // Game over message
    if (gameOver) {
      const submitText = ' Please submit game to Aztec';
      const lossMessage = `Your opponent won the game.${
        !submitted ? submitText : ''
      }`;
      const winMessage = `You won the game!${!submitted ? submitText : ''}`;
      if (gameOver === 3) {
        return `Game ended in draw.${!submitted ? submitText : ''}`;
      } else if (gameOver === 2) {
        return isHost ? lossMessage : winMessage;
      } else {
        return isHost ? winMessage : lossMessage;
      }
    }

    // Text displayed when challenger needs to join game
    else if (!activeGame.challenger) {
      return 'Waiting for opponent to join.';
    }

    // If two players join game but have not both signed to open a channel
    else if (!channelOpen) {
      if (isHost) {
        return 'Opponent has joined game and signed channel open. Please provide your signature to start the game';
      } else {
        return 'Waiting on host to sign channel open.';
      }
    } else if (answeringTimeout) {
      return 'Answering timeout...';
    } else if (activeGame.timeout > 0n) {
      if (isTurn) {
        return 'Your opponent has triggered a timeout against you. Please answer within the remaining time';
      } else {
        return 'Waiting for opponent to answer timeout';
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
    else if (activeGame.turnIndex !== activeGame.turns.length) {
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
  }, [activeChannel, activeGame, answeringTimeout, gameOver, isHost]);

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
          const deserialized = deserializeGame(res.game);
          setActiveGame(deserialized);
          initializeChannel(deserialized, latestPostedTurn);
          setShowPiece({ row: -1, col: -1 });
        }
      }
    );
  };

  const submitGame = async () => {
    if (!activeChannel || !socket) return;
    setSubmittingGame(true);
    try {
      await activeChannel.finalize();
      socket.emit('game:gameSubmitted', undefined, (res: any) => {
        if (res.status === 'success') {
          setActiveGame((prev: any) => ({
            ...prev,
            over: true,
            timeout: 0n,
          }));
          setSubmittingGame(false);
        }
      });
    } catch (err) {
      setSubmittingGame(false);
    }
  };

  const submitTurn = async () => {
    if (!activeChannel || !socket) return;
    const turn = activeGame.turns[activeGame.turnIndex];

    const move = activeChannel.buildMove(turn.row, turn.col);
    const turnResult = await activeChannel.turn(move, turn.opponentSignature);

    socket.emit(
      'game:finalizeTurn',
      {
        id: activeGame._id,
        turnResult: turnResult.toJSON(),
      },
      (res: any) => {
        if (res.status === 'success') {
          const deserialized = deserializeGame(res.game);
          setActiveGame(deserialized);
          initializeChannel(deserialized, latestPostedTurn);
          setShowPiece({ row: -1, col: -1 });
        }
      }
    );
  };

  const triggerTimeout = async () => {
    if (!activeChannel || !contract || !socket || !wallet) return;
    setTriggeringTimeout(true);
    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    let payload = { id: undefined, turnResult: {} };

    if (!isTurn && activeChannel.turnResults.length) {
      // Recompute prior turn result with timeout;
      const prevTurn = activeGame.turns[activeGame.turnIndex - 1];
      const move = new Move(
        AztecAddress.fromString(prevTurn.sender),
        prevTurn.row,
        prevTurn.col,
        activeGame.turnIndex - 1,
        BigInt(prevTurn.gameId)
      );
      // Remove last turn and recompute turn with timeout
      activeChannel.turnResults.pop();
      await activeChannel.turn(move, prevTurn.opponentSignature, true);
      await activeChannel.finalize();
    }
    // Manual timeout trigger in case of no turn results
    else if (!isTurn) {
      await triggerManualTimeout(activeGame.gameId, wallet, contract);
    } else {
      // Add turn to active channel before finalizing
      const turn = activeGame.turns[activeGame.turnIndex];

      const move = new Move(
        AztecAddress.fromString(turn.sender),
        turn.row,
        turn.col,
        activeGame.turnIndex,
        BigInt(turn.gameId)
      );

      const turnResult = await activeChannel.turn(move, undefined, true);
      await activeChannel.finalize();

      payload.id = activeGame._id;
      payload.turnResult = turnResult.toJSON();
    }
    setTriggeringTimeout(false);
    // Put websocket functionality here
    socket.emit('game:timeoutTriggered', payload, async (res: any) => {
      if (res.status === 'success') {
        const timeout = await getTimeout(activeGame.gameId, wallet, contract);
        if (res.game) {
          const deserialized = deserializeGame(res.game);
          deserialized.timeout = timeout;
          setActiveGame(deserialized);
        } else {
          setActiveGame((prev: any) => ({
            ...prev,
            timeout,
          }));
        }
      }
    });
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
                        (activeGame.timeout > 0n
                          ? answerActiveTimeout(rowIndex, colIndex)
                          : handlePlacement(rowIndex, colIndex))
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
                        !occupied &&
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

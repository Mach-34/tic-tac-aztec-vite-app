import { useEffect, useMemo, useState } from 'react';
import MainLayout from 'layouts/MainLayout';
import { Circle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TTZSocketEvent, useUser } from 'contexts/UserContext';
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
  claimTimeoutWin,
  cloneGame,
  getAztecGameState,
  getTimeout,
  proveDoubleSpendFraud,
  storeGame,
  triggerManualTimeout,
} from 'utils';
import { ADDRESS_ZERO, WINNING_PLACEMENTS } from 'utils/constants';
import {
  DoubleSpendFraudPayload,
  Game,
  SocketCallbackResponse,
  Turn,
} from 'utils/types';
import { SchnorrSignature } from '@aztec/circuits.js/barretenberg';
import StatusBadge from './components/StatusBadge';
import useCountdown from 'hooks/useCountdown';
// import DuplicationFraudModal from './components/DuplicationFraudModal';

export default function GameView(): JSX.Element {
  const socket = useSocket();
  const { wallet, activeGame, setActiveGame, signingIn, contract } = useUser();
  const countdown = useCountdown(Number(activeGame?.timeout ?? 0));
  const navigate = useNavigate();
  const [answeringTimeout, setAnsweringTimeout] = useState(false);
  const [board, setBoard] = useState<number[]>([]);
  const [finalizingTurn, setFinalizingTurn] = useState(false);
  const [signingTurn, setSigningTurn] = useState(false);
  const [showPiece, setShowPiece] = useState({ row: -1, col: -1 });
  const [submittingGame, setSubmittingGame] = useState(false);
  const [triggeringTimeout, setTriggeringTimeout] = useState(false);

  /**
   * Checks if current board has a winnning placement
   * @returns {boolean} whether or not there are 3 pieces in a column, row, or diagonal
   */
  const checkWinningPlacement = (): boolean => {
    return WINNING_PLACEMENTS.some((placement: number[]) => {
      let total = 0;
      for (const pos of placement) {
        total += board[pos];
      }
      return total == 3 || total == 12;
    });
  };

  /**
   * Constructs Tic Tac Toe board from turn history
   */
  // @TODO: May need to change to account for fetching game state from oncchain
  const constructBoard = () => {
    const board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    activeGame.turns.forEach((turn: any, index: number) => {
      const coord = turn.row * 3 + turn.col;
      board[coord] = index % 2 === 0 ? 1 : 4;
    });
    setBoard(board);
  };

  const timeoutExpired = useMemo(() => {
    if (!activeGame || !activeGame.timeout) return false;
    return countdown.minutes === '0' && countdown.seconds === '00';
  }, [countdown]);

  const canMove = useMemo(() => {
    if (!activeGame) return;
    const channel = activeGame.channel;
    const channelOpened =
      channel instanceof ContinuedStateChannel || channel?.openChannelResult;
    if (answeringTimeout || !channelOpened || timeoutExpired) return false;
    const isHost =
      wallet?.getAddress().toString() === activeGame.host.toString();

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    return isTurn && activeGame.turns.length === activeGame.turnIndex;
  }, [activeGame, answeringTimeout, timeoutExpired, wallet]);

  const isHost = useMemo(() => {
    if (!activeGame) return false;
    return wallet?.getAddress().toString() === activeGame.host.toString();
  }, [activeGame]);

  const gameOver = useMemo(() => {
    if (!activeGame) return 0;

    const isDraw = activeGame.turnIndex === 9;
    const finalized = activeGame.turnIndex === activeGame.turns.length;
    const winningPlacement = checkWinningPlacement();
    // Case where win occurs from timeout or fraud
    if (activeGame.over && !isDraw && !winningPlacement) {
      return activeGame.turnIndex % 2 === 1 ? 1 : 2;
    } else if ((activeGame.over || finalized) && winningPlacement) {
      // 1 for host, 2 for challenger
      return activeGame.turnIndex % 2 === 1 ? 1 : 2;
    }
    // If game is draw return 0
    return isDraw && (finalized || activeGame.over) ? 3 : 0;
  }, [activeGame, board, isHost]);

  const signOpponentTurn = async () => {
    if (!socket || !wallet) return;
    setSigningTurn(true);
    const turn = activeGame.turns[activeGame.turnIndex];

    const move = new Move(
      AztecAddress.fromString(turn.sender),
      turn.row,
      turn.col,
      activeGame.turnIndex,
      BigInt(turn.gameId)
    );

    const signature = move.sign(wallet).toString();

    socket.emit(
      TTZSocketEvent.SignOpponentTurn,
      {
        signature: signature,
      },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          setActiveGame((prev: Game) => {
            const clone = cloneGame(prev);
            clone.turns[clone.turnIndex].opponentSignature = signature;
            // Update locally stored game
            storeGame(clone, wallet.getAddress());
            return clone;
          });
        }
        setSigningTurn(false);
      }
    );
  };

  const checkFraud = async () => {
    // Check premature timeout fraud
    // const { lastPostedTurn, timeout } = activeGame;
    // // Look for turn greater than or equal to last posted turn
    // if (timeout) {
    //   const triggerer =
    //     lastPostedTurn % 2 === 0 ? activeGame.challenger : activeGame.host;
    //   const found = activeGame.turns
    //     .slice(lastPostedTurn - 1)
    //     .findIndex((turn) => {
    //       // Missing signature timeout
    //       // Next turn timeout
    //       if (turn.turnIndex >= lastPostedTurn) {
    //         return;
    //       }
    //     });
    // }

    // Check double spend fraud
    const turnCountMap: { [turnIndex: number]: Turn } = {};
    for (const turn of activeGame.turns) {
      // Check if turn has already been sto
      if (!!turnCountMap[turn.turnIndex]) {
        await proveDoubleSpend(turnCountMap[turn.turnIndex], turn);
        return true;
      }
      turnCountMap[turn.turnIndex] = turn;
    }
    return false;
  };

  const actions = useMemo(() => {
    if (!activeGame) return <></>;
    const arr: JSX.Element[] = [];
    const channel = activeGame.channel;

    const currentTurn = activeGame.turns[activeGame.turnIndex];

    const channelOpen =
      channel instanceof ContinuedStateChannel || !!channel?.openChannelResult;

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    const submitted = activeGame.over;

    // Turn related actions

    if (submitted) {
      return arr;
    }

    if (
      (gameOver &&
        (activeGame.timeout === 0 || (activeGame.timeout > 0 && isTurn))) ||
      timeoutExpired
    ) {
      arr.push(
        <Button
          className='my-2'
          key='Submit Game'
          loading={submittingGame}
          onClick={() => submitGame()}
          text={submittingGame ? 'Submitting game...' : 'Submit game'}
        />
      );
    } else if (
      isHost &&
      activeGame.challenger.toString() !== ADDRESS_ZERO &&
      !channelOpen
    ) {
      arr.push(
        <Button
          className='my-2'
          key='Sign Open Channel'
          onClick={() => commence()}
          text='Sign Open Channel'
        />
      );
    }

    if (!gameOver && channelOpen && activeGame.turns.length) {
      // Timeout related actions

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
            text={triggeringTimeout ? 'Triggering timeout' : 'Trigger timeout'}
          />
        );
      }
    }

    return arr;
  }, [
    activeGame,
    gameOver,
    isHost,
    submittingGame,
    timeoutExpired,
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
      await answerTimeout(activeGame.id, wallet, contract, row, col);
      const turn: Turn = {
        sender: wallet?.getAddress().toString(),
        row: row,
        col: col,
        turnIndex: activeGame.turnIndex,
        gameId: activeGame.id,
      };
      socket.emit(
        TTZSocketEvent.AnswerTimeout,
        {
          turn,
        },
        async (res: SocketCallbackResponse) => {
          if (res.status === 'success') {
            const latestPostedState = await getAztecGameState(
              activeGame.id,
              wallet,
              contract
            );
            setActiveGame((prev: Game) => {
              const clone = cloneGame(prev);
              const lastPostedTurn = Number(latestPostedState.turn);
              // Channel is continued
              clone.channel = new ContinuedStateChannel(
                wallet,
                contract,
                BigInt(clone.id),
                lastPostedTurn
              );
              clone.lastPostedTurn = lastPostedTurn;
              clone.over = latestPostedState.over;
              clone.timeout = 0;
              clone.turns.push(turn);
              clone.turnIndex += 1;

              // Update locally stored game
              storeGame(clone, wallet.getAddress());
              return clone;
            });
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
    const clone = cloneGame(activeGame);
    const channel = clone.channel;
    if (!(channel instanceof BaseStateChannel) || !wallet || !socket) return;
    const { challengerOpenSignature } = clone;
    const openChannelResult = await channel.openChannel(
      challengerOpenSignature!
    );

    socket.emit(
      TTZSocketEvent.OpenChannel,
      {
        openChannelResult: openChannelResult.toJSON(),
      },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          setActiveGame(clone);

          // Update locally stored game
          storeGame(clone, wallet.getAddress());
        }
      }
    );
  };

  const placePiece = async (row: number, col: number) => {
    const channel = activeGame.channel;
    if (!channel || !wallet || !socket) return;
    const move = channel.buildMove(row, col);
    const signature = move.sign(wallet);
    const turn: Turn = {
      sender: move.sender.toString(),
      senderSignature: signature.toString(),
      row: move.row,
      col: move.col,
      turnIndex: move.turnIndex,
      gameId: activeGame.id,
    };
    socket.emit(
      TTZSocketEvent.Turn,
      {
        turn,
      },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          setActiveGame((prev: Game) => {
            const clone = cloneGame(prev);
            clone.turns.push(turn);
            // Update locally stored game
            storeGame(clone, wallet.getAddress());
            return clone;
          });
          setShowPiece({ row: -1, col: -1 });
        }
      }
    );
  };

  const submitGame = async () => {
    const clone = cloneGame(activeGame);
    const channel = clone.channel;
    if (!channel || !contract || !socket || !wallet) return;
    setSubmittingGame(true);
    try {
      // Check if timeout hash expired. If not finalize
      if (timeoutExpired) {
        await claimTimeoutWin(activeGame.id, wallet, contract);
      } else if (activeGame.timeout > 0) {
        // Answer timeout on ending move
        await answerTimeout(activeGame.id, wallet, contract, 0, 0);
      } else {
        const tx = await channel.finalize();
        console.log('Aztec transaction: ', tx);
      }
      socket.emit(
        TTZSocketEvent.SubmitGame,
        undefined,
        (res: SocketCallbackResponse) => {
          if (res.status === 'success') {
            clone.timeout = 0;
            clone.over = true;
            setActiveGame(clone);
          }
        }
      );
    } catch (err) {
      console.log('Err: ', err);
      setSubmittingGame(false);
    }
  };

  const proveDoubleSpend = async (moveOne: Turn, moveTwo: Turn) => {
    if (!wallet) return;
    const payload: DoubleSpendFraudPayload = {
      firstMove: [moveOne.row, moveOne.col],
      firstSignature: SchnorrSignature.fromString(moveOne.senderSignature!),
      gameId: moveOne.gameId,
      secondMove: [moveTwo.row, moveTwo.col],
      secondSignature: SchnorrSignature.fromString(moveTwo.senderSignature!),
      turnIndex: moveOne.turnIndex,
    };
    await proveDoubleSpendFraud(wallet, wallet.getAddress(), payload);
  };

  const finalizeTurn = async () => {
    const clone = cloneGame(activeGame);
    const channel = clone.channel;
    if (!channel || !socket || !wallet) return;
    setFinalizingTurn(true);
    const turn = clone.turns[activeGame.turnIndex];

    const move = channel.buildMove(turn.row, turn.col);
    const turnResult = await channel.turn(
      move,
      SchnorrSignature.fromString(turn.opponentSignature!)
    );

    socket.emit(
      TTZSocketEvent.FinalizeTurn,
      {
        turnResult: turnResult.toJSON(),
      },
      (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          clone.turnIndex += 1;
          setActiveGame(clone);

          // Update locally stored game
          storeGame(clone, wallet.getAddress());
        }
        setFinalizingTurn(false);
      }
    );
  };

  const triggerTimeout = async () => {
    const clone = cloneGame(activeGame);
    const channel = activeGame.channel;
    if (!channel || !contract || !socket || !wallet) return;
    setTriggeringTimeout(true);
    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    let payload: { turnResult: object | undefined } = { turnResult: undefined };

    if (!isTurn && channel.turnResults.length) {
      // Recompute prior turn result with timeout;
      const prevTurn = clone.turns[clone.turnIndex - 1];
      const move = new Move(
        AztecAddress.fromString(prevTurn.sender),
        prevTurn.row,
        prevTurn.col,
        activeGame.turnIndex - 1,
        BigInt(prevTurn.gameId)
      );
      // Remove last turn and recompute turn with timeout
      channel.turnResults.pop();
      await channel.turn(
        move,
        // SchnorrSignature.fromString(prevTurn.opponentSignature!),
        undefined,
        true
      );
      await channel.finalize();
    }
    // Manual timeout trigger in case of no turn results
    else if (!isTurn) {
      await triggerManualTimeout(activeGame.id, wallet, contract);
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

      const turnResult = await channel.turn(move, undefined, true);
      await channel.finalize();

      payload.turnResult = turnResult.toJSON();
    }
    setTriggeringTimeout(false);
    // Put websocket functionality here
    socket.emit(
      TTZSocketEvent.TriggerTimeout,
      payload,
      async (res: SocketCallbackResponse) => {
        if (res.status === 'success') {
          clone.timeout = Number(
            await getTimeout(activeGame.id, wallet, contract)
          );
          if (payload.turnResult) {
            clone.turnIndex += 1;
          }
          clone.lastPostedTurn = clone.turnIndex;
          setActiveGame(clone);
          // Update locally stored game
          storeGame(clone, wallet.getAddress());
        }
      }
    );
  };

  // console.log('Active game timeout: ', activeGame);

  useEffect(() => {
    (async () => {
      // Kick back to lobby if not in game
      if (!signingIn && !activeGame) {
        navigate('/lobby');
      } else {
        constructBoard();
      }
      // Check if turn needs to be finalized
      if (activeGame) {
        if (!(await checkFraud())) {
          // Finalize turn
          const isTurn = isHost
            ? activeGame.turnIndex % 2 === 0
            : activeGame.turnIndex % 2 === 1;
          const currentTurn = activeGame.turns[activeGame.turnIndex];
          const opponentSigned = currentTurn && currentTurn.opponentSignature;
          const finalized = activeGame.turnIndex === activeGame.turns.length;
          // Finalize turn
          if (isTurn && opponentSigned && !finalized) {
            finalizeTurn();
          }
          // Sign opponent turn
          else if (!isTurn && currentTurn && !opponentSigned) {
            signOpponentTurn();
          }
        }
      }
    })();
  }, [activeGame, signingIn]);

  return (
    <MainLayout>
      <div className='flex gap-4 items-center justify-between p-4'>
        <div>
          <StatusBadge
            answeringTimeout={answeringTimeout}
            challengerJoined={
              activeGame?.challenger.toString() === ADDRESS_ZERO
            }
            channel={activeGame?.channel}
            countdown={countdown}
            currentTurn={activeGame?.turns[activeGame.turnIndex]}
            finalizingTurn={finalizingTurn}
            gameOver={gameOver}
            isHost={isHost}
            signingTurn={signingTurn}
            submitted={!!activeGame?.over}
            timeout={activeGame?.timeout ?? 0}
            timeoutExpired={timeoutExpired}
            turnIndex={activeGame?.turnIndex ?? 0}
            turns={activeGame?.turns ?? []}
          />
        </div>
        <div>{actions}</div>
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
                          : placePiece(rowIndex, colIndex))
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
                        (activeGame.host.toString() ===
                        wallet?.getAddress().toString() ? (
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
    </MainLayout>
  );
}

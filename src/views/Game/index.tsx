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
  cloneGame,
  getTimeout,
  storeGame,
  triggerManualTimeout,
} from 'utils';
import { ADDRESS_ZERO, WINNING_PLACEMENTS } from 'utils/constants';
import { Game, SocketCallbackResponse, Turn } from 'utils/types';
import { SchnorrSignature } from '@aztec/circuits.js/barretenberg';
// import DuplicationFraudModal from './components/DuplicationFraudModal';

export default function GameView(): JSX.Element {
  const socket = useSocket();
  const { wallet, activeGame, setActiveGame, signingIn, contract } = useUser();
  const navigate = useNavigate();
  const [answeringTimeout, setAnsweringTimeout] = useState(false);
  const [board, setBoard] = useState<number[]>([]);
  // const [showDuplicationModal, setShowDuplicationModal] = useState(false);
  const [showPiece, setShowPiece] = useState({ row: -1, col: -1 });
  const [submittingGame, setSubmittingGame] = useState(false);
  const [triggeringTimeout, setTriggeringTimeout] = useState(false);
  // const [showSignatureModal, setShowSignatureModal] = useState(false);

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

  const canMove = useMemo(() => {
    if (!activeGame) return;
    const channel = activeGame.channel;
    const channelOpened =
      channel instanceof ContinuedStateChannel || channel?.openChannelResult;
    if (answeringTimeout || !channelOpened) return false;
    const isHost =
      wallet?.getAddress().toString() === activeGame.host.toString();

    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    return isTurn && activeGame.turns.length === activeGame.turnIndex;
  }, [activeGame, answeringTimeout, wallet]);

  const isHost = useMemo(() => {
    if (!activeGame) return false;
    return wallet?.getAddress().toString() === activeGame.host.toString();
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
    if (!wallet || !socket) return;
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
      }
    );
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
  }, [activeGame, gameOver, isHost, submittingGame, triggeringTimeout]);

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
            setActiveGame((prev: Game) => {
              const clone = cloneGame(prev);
              const lastPostedTurn = clone.lastPostedTurn + 1;
              // Channel is continued
              clone.channel = new ContinuedStateChannel(
                wallet,
                contract,
                BigInt(clone.id),
                lastPostedTurn
              );
              clone.lastPostedTurn += lastPostedTurn;
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

  const statusMessage = useMemo(() => {
    if (!activeGame) return '';

    const channel = activeGame.channel;
    const channelOpen =
      channel instanceof ContinuedStateChannel || !!channel?.openChannelResult;
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
    else if (activeGame.challenger.toString() === ADDRESS_ZERO) {
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
  }, [activeGame, answeringTimeout, gameOver, isHost]);

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
    if (!channel || !socket) return;
    setSubmittingGame(true);
    try {
      await channel.finalize();
      socket.emit(
        TTZSocketEvent.SubmitGame,
        undefined,
        (res: SocketCallbackResponse) => {
          if (res.status === 'success') {
            clone.over = true;
            setActiveGame(clone);
          }
        }
      );
    } catch (err) {
      setSubmittingGame(false);
    }
  };

  const submitTurn = async () => {
    const clone = cloneGame(activeGame);
    const channel = clone.channel;
    if (!channel || !socket || !wallet) return;
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
      (res: any) => {
        if (res.status === 'success') {
          clone.turnIndex += 1;
          setActiveGame(clone);

          // Update locally stored game
          storeGame(clone, wallet.getAddress());
        }
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
        SchnorrSignature.fromString(prevTurn.opponentSignature!),
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
          setActiveGame(clone);
          // Update locally stored game
          storeGame(clone, wallet.getAddress());
        }
      }
    );
  };

  useEffect(() => {
    // Kick back to lobby if not in game
    if (!signingIn && !activeGame) {
      navigate('/lobby');
    } else {
      constructBoard();
    }
    // Check if turn needs to be finalized
    //   const isTurn = isHost
    //     ? activeGame.turnIndex % 2 === 0
    //     : activeGame.turnIndex % 2 === 1;
    //   const currentTurn = activeGame.turns[activeGame.turnIndex];
    //   if (
    //     isTurn &&
    //     currentTurn?.opponentSignature &&
    //     activeGame.turnIndex !== activeGame.turns.length
    //   ) {
    //     submitTurn();
    //   }
    // }
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
      {/* <DuplicationFraudModal
        game={activeGame}
        onClose={() => setShowDuplicationModal(false)}
        open={showDuplicationModal}
      /> */}
    </MainLayout>
  );
}

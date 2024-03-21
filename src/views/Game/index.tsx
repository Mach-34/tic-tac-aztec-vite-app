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

export default function Game(): JSX.Element {
  const socket = useSocket();
  const {
    address,
    activeChannel,
    activeGame,
    initializeChannel,
    privkey,
    pubkey,
    setActiveGame,
    signingIn,
  } = useUser();
  const navigate = useNavigate();
  const [board, setBoard] = useState<number[]>([]);
  const [showPiece, setShowPiece] = useState({ row: -1, col: -1 });
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

  const isHost = useMemo(() => {
    if (!activeGame) return false;
    return address === activeGame.host;
  }, [activeGame]);

  const endCondition = useMemo(() => {
    if (!activeGame) return;
    const winningPlacement = checkWinningPlacement();
    if (winningPlacement) {
      return isHost;
    }
    return activeGame.turnIndex === 9;
  }, [activeGame, board, isHost]);

  const pendingOpponentMoveSignature = useMemo(() => {
    if (!activeChannel || !activeGame) return false;
    if (activeGame.turnIndex === 0) {
      return true;
    }
    return !activeGame.turns[activeGame.turnIndex]?.opponentSignature;
  }, [activeChannel, activeGame]);

  const yourTurn = useMemo(() => {
    if (!activeGame || !activeChannel?.openChannelResult) return false;
    const isHost = address === activeGame.host;
    if (isHost) {
      return activeGame.turnIndex % 2 === 0;
    } else {
      return activeGame.turnIndex % 2 === 1;
    }
  }, [activeChannel, activeGame, address]);

  const signOpponentTurn = async () => {
    if (!activeChannel || !privkey || !socket) return;
    const turn = activeGame.turns[activeGame.turnIndex];

    const move = new Move(
      AztecAddress.fromString(turn.sender),
      turn.row,
      turn.col,
      activeGame.turnIndex,
      BigInt(turn.gameId)
    );

    const signature = move.sign(privkey);

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
    if (!activeChannel || !activeGame) return <></>;

    const currentTurn = activeGame.turns[activeGame.turnIndex];
    const isTurn = isHost
      ? activeGame.turnIndex % 2 === 0
      : activeGame.turnIndex % 2 === 1;

    if (endCondition) {
      return <Button onClick={() => submitGame()} text='Submit Game' />;
    } else if (
      isHost &&
      activeGame.challengerOpenSignature &&
      !activeChannel.openChannelResult
    ) {
      return <Button onClick={() => commence()} text='Sign Open Channel' />;
    } else {
      if (currentTurn) {
        if (!isTurn && !currentTurn.opponentSignature) {
          return (
            <Button
              onClick={() => signOpponentTurn()}
              text='Sign Opponent Move'
            />
          );
        } else if (
          isTurn &&
          currentTurn.opponentSignature &&
          activeChannel.turnResults.length !== activeGame.turns.length
        ) {
          return <Button onClick={() => submitTurn()} text='Finalize Turn' />;
        }
      } else {
        return <></>;
      }
    }
  }, [activeChannel, activeGame, endCondition, isHost]);

  const commence = async () => {
    if (!activeChannel || !privkey || !socket) return;
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
    if (!activeChannel || !activeGame || !privkey || !pubkey || !socket) return;

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
          gameId: Number(move.gameIndex),
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
                        yourTurn &&
                        pendingOpponentMoveSignature &&
                        handlePlacement(rowIndex, colIndex)
                      }
                      onMouseEnter={() =>
                        !occupied &&
                        yourTurn &&
                        pendingOpponentMoveSignature &&
                        setShowPiece({ row: rowIndex, col: colIndex })
                      }
                      onMouseLeave={() =>
                        yourTurn && setShowPiece({ row: -1, col: -1 })
                      }
                    >
                      {occupied &&
                        (val === 4 ? (
                          <Circle color='#2D2047' size={60} />
                        ) : (
                          <X color='#2D2047' size={60} />
                        ))}
                      {isHovering &&
                        (activeGame.host === address ? (
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

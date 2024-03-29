import { AztecAddress } from '@aztec/circuits.js';
import { StateChannel } from 'contexts/UserContext';
import { OpenChannelSignature } from '@mach-34/aztec-statechannel-tictactoe/dest/src/channel/base';

export type Game = {
    challenger: AztecAddress;
    challengerOpenSignature: OpenChannelSignature | undefined;
    channel: StateChannel | undefined;
    host: AztecAddress;
    id: string;
    lastPostedTurn: number;
    over: boolean;
    timeout: number;
    // @TODO: Remove any
    turns: any[];
    turnIndex: number;
};

// Game in LocalStorage friendly format
export type SerializedGame = {
    challenger: string;
    challengerOpenSignature: string[] | undefined;
    host: string;
    id: string;
    lastPostedTurn: number;
    openChannelResult: object | undefined;
    over: boolean;
    timeout: number;
    // @TODO: Remove any
    turns: any[];
    turnResults: object[];
    turnIndex: number;
}

export type Turn = {
    sender: string
}


// ##### Socket Event Responses #####

export type JoinGameResponse = {
    address: string
    id: string
    signature: string[]
}

export type OpenChannelResponse = {
    openChannelResult: object;
}

export type SocketCallbackResponse = {
    status: string
}

export type StartGameResponse = {
    address: string
}
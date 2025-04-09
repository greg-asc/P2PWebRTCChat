import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';

import {
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    // mediaDevices // For future use if needed
} from 'react-native-webrtc';

// For whatever reason deep imports seem to be the only thing that works here...?
// (I might be doing something wrong)
// TODO: try to find a cleaner way to achieve the same results without deep imports?
import MessageEvent         from 'react-native-webrtc/lib/typescript/MessageEvent';
import RTCDataChannelEvent  from 'react-native-webrtc/lib/typescript/RTCDataChannelEvent';
import RTCIceCandidateEvent from 'react-native-webrtc/lib/typescript/RTCIceCandidateEvent';

// Config
const SIGNALING_SERVER_URL = 'ws://localhost:8080';

const PEER_CONNECTION_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // TODO: Add TURN servers for production
    ],
};

// TODO: move this to a common file like src/types.ts
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

interface WebRTCMessage {
    type: 'text' | 'gif' | 'reaction'; // TODO: Add other types if needed
    content: any;
    id?: string; // Optional: message ID for reactions
    reaction?: string; // Optional: reaction type
}

type RTCDataChannelType = ReturnType<RTCPeerConnection['createDataChannel']>;

interface UseWebRTCReturn {
    connectionStatus:     ConnectionStatus;
    connect:              (myId: string, targetId: string) => void;
    disconnect:           () => void;
    sendMessage:          (message: WebRTCMessage) => void;
    lastReceivedMessage:  WebRTCMessage | null; // To trigger updates in component
    error:                string | null;
}


export function useWebRTC(): UseWebRTCReturn {
    const ws                                            = useRef<WebSocket | null>(null);
    const pc                                            = useRef<RTCPeerConnection | null>(null);
    const dataChannel                                   = useRef<RTCDataChannelType | null>(null);
    const [connectionStatus, setConnectionStatus]       = useState<ConnectionStatus>('disconnected');
    const [error, setError]                             = useState<string | null>(null);
    const [lastReceivedMessage, setLastReceivedMessage] = useState<WebRTCMessage | null>(null);

    // Store user IDs - needed for signaling handlers
    const myUserId = useRef<string | null>(null);
    const targetPeerId = useRef<string | null>(null);

    // --- Utility Functions ---
    const resetConnectionState = () => {
        setConnectionStatus('disconnected');
        setError(null);
        setLastReceivedMessage(null);
        pc.current = null;
        dataChannel.current = null;
        // Keep ws ref for potential reconnect? Or null it out too? Need to decide on the strategy.
        // ws.current = null;
    };

    const handleError = (message: string, err?: any) => {
        console.error(`WebRTC Hook Error: ${message}`, err);
        setError(message);
        setConnectionStatus('error');
        Alert.alert("Connection Error", message); // Feedback for the user
        // TODO: more robust cleanup here...?
        disconnect();
    };

    // --- Signaling Message Sender ---
    const sendSignalingMessage = useCallback((message: object) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log('HOOK: Sending signaling message:', message);
            ws.current.send(JSON.stringify(message));
        } else {
            handleError('Cannot send signaling message: WebSocket not open.');
        }
    }, []); // Depends only on ws.current state


    // --- Data Channel Handlers ---
    const setupDataChannelEventHandlers = useCallback((channel: RTCDataChannelType) => {
        const onDataChannelOpen = () => {
            console.log(`HOOK: Data Channel '${channel.label}' OPEN`);
            setConnectionStatus('connected');
            setError(null);
        };

        const onDataChannelMessage = (event: MessageEvent<'message'>) => {
            console.log(`HOOK: Data Channel Message Received: ${event.data}`);
            try {
                // Ensure data is treated as string before parsing
                const dataString = typeof event.data === 'string' ? event.data : String(event.data);
                const receivedMsg: WebRTCMessage = JSON.parse(dataString);
                setLastReceivedMessage(receivedMsg);
            } catch (e) {
                console.error("HOOK: Failed to parse data channel message", event.data, e);
            }
        };

        const onDataChannelClose = () => {
            console.log(`HOOK: Data Channel '${channel.label}' CLOSED`);
            if (connectionStatus !== 'error' && connectionStatus !== 'failed') {
                setConnectionStatus('disconnected');
            }
            // Potentially clear dataChannel ref? dataChannel.current = null; (careful if used elsewhere)
        };

        // Type for error event might be Event or RTCErrorEvent depending on library specifics
        const onDataChannelError = (event: RTCDataChannelEvent<'error'>) => {
            // Log the event object to see its structure
            console.error("HOOK: Data Channel Error event:", event);
            // Extract message if possible (might be on event.error or just a generic event)
            const errorMessage = (event as any).message || 'Unknown data channel error';
            handleError(`Data Channel Error: ${errorMessage}`, event);
        };

        channel.addEventListener('open', onDataChannelOpen);
        channel.addEventListener('message', onDataChannelMessage);
        channel.addEventListener('close', onDataChannelClose);
        channel.addEventListener('error', onDataChannelError);
    }, [connectionStatus]); // Re-create if connectionStatus changes


    // --- Peer Connection Handlers ---
    const setupPeerConnectionEventHandlers = useCallback((peerConnection: RTCPeerConnection, targetId: string) => {
        const handleIceCandidate = (event: RTCIceCandidateEvent<"icecandidate">) => {
            if (event.candidate) {
                console.log('HOOK: Generated ICE candidate, sending...');
                sendSignalingMessage({
                    type: 'candidate',
                    target: targetId,
                    payload: event.candidate.toJSON(),
                });
            } else {
                console.log('HOOK: All ICE candidates have been sent');
            }
        };
        peerConnection.addEventListener('icecandidate', handleIceCandidate);

        const handleDataChannel = (event: RTCDataChannelEvent<"datachannel">) => {
            console.log('HOOK: Received Data Channel!');
             // Access the channel property from the event object
             const receivedChannel = event.channel as RTCDataChannelType; // Cast needed if TS can't infer strongly
             if (receivedChannel) {
                 dataChannel.current = receivedChannel; // Store reference
                 setupDataChannelEventHandlers(receivedChannel);
             } else {
                 console.error("HOOK: 'datachannel' event received, but channel property was missing or invalid.", event);
             }
        };
        peerConnection.addEventListener('datachannel', handleDataChannel);

        const handleIceConnectionStateChange = () => {
            if (!pc.current) return; // Guard clause
            console.log(`HOOK: ICE Connection State Change: ${pc.current.iceConnectionState}`);
            switch (pc.current.iceConnectionState) {
                // ... same switch logic as before ...
                 case 'checking':
                    setConnectionStatus('connecting');
                    break;
                case 'connected':
                case 'completed':
                     break; // Wait for data channel
                case 'disconnected':
                    setConnectionStatus('connecting'); // Or 'reconnecting'
                    break;
                case 'failed':
                    handleError('Peer connection failed (ICE).');
                    break;
                case 'closed':
                    if (connectionStatus !== 'error' && connectionStatus !== 'failed') {
                         setConnectionStatus('disconnected');
                    }
                    break;
            }
        };
        peerConnection.addEventListener('iceconnectionstatechange', handleIceConnectionStateChange);

        const handleConnectionStateChange = () => {
            if (!pc.current) return; // Guard clause

            console.log(`HOOK: Connection State Change: ${pc.current.connectionState}`);
            switch (pc.current.connectionState) {
                // ... same switch logic as before ...
                 case 'connecting':
                    setConnectionStatus('connecting');
                    break;
                case 'connected':
                     break; // Wait for data channel
                 case 'disconnected':
                     setConnectionStatus('connecting'); // Or 'reconnecting'
                     break;
                 case 'failed':
                     handleError('Peer connection failed (Connection State).');
                     break;
                 case 'closed':
                      if (connectionStatus !== 'error' && connectionStatus !== 'failed') {
                         setConnectionStatus('disconnected');
                     }
                     break;
            }
        };
        peerConnection.addEventListener('connectionstatechange', handleConnectionStateChange);

    }, [sendSignalingMessage, setupDataChannelEventHandlers, connectionStatus]); // Recreate if dependencies change

    // --- Disconnect Function (Called by Component) ---
    const disconnect = useCallback(() => {
        console.log("HOOK: Disconnecting...");
        if (dataChannel.current) {
            dataChannel.current.close();
            dataChannel.current = null;
        }
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }
        if (ws.current) {
             // Send a polite disconnect message? Maybe not necessary if server handles close.
            ws.current.close();
            ws.current = null;
        }
        resetConnectionState();
    }, []);

    // --- Initiate Connection (Caller) ---
    const initiatePeerConnection = useCallback(async (targetId: string) => {
         if (pc.current) {
             console.warn("HOOK: Existing peer connection found, closing first.");
             disconnect(); // Ensure clean state
             await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
         }
         console.log(`HOOK: Initiating peer connection to ${targetId}...`);
         setConnectionStatus('connecting');

         try {
             pc.current = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
             setupPeerConnectionEventHandlers(pc.current, targetId);

             console.log("HOOK: Creating Data Channel...");
             const channel = pc.current.createDataChannel('chat-data-channel', { ordered: true });
             dataChannel.current = channel;
             setupDataChannelEventHandlers(channel);

             console.log("HOOK: Creating Offer...");
             const offerOptions = {
               offerToReceiveAudio: false,
               offerToReceiveVideo: false,
             };
             const offer = await pc.current.createOffer(offerOptions);
             await pc.current.setLocalDescription(offer);
             console.log("HOOK: Set local description (offer)");

             sendSignalingMessage({ type: 'offer', target: targetId, payload: offer });

         } catch (err) {
             handleError('Error initiating peer connection.', err);
         }

    }, [disconnect, setupPeerConnectionEventHandlers, setupDataChannelEventHandlers, sendSignalingMessage]); // Dependencies for initiation


    // --- WebSocket Message Handler ---
    const handleSignalingMessage = useCallback(async (message: any) => {
        console.log('HOOK: Handling signaling message:', message.type);

        switch (message.type) {
            case 'login_success':
                console.log(`HOOK: Logged in as ${message.payload?.userId}`);
                // If we have a target, maybe initiate connection now?
                if (targetPeerId.current) {
                     initiatePeerConnection(targetPeerId.current);
                }
                break;

            case 'offer': // Received an offer (Callee role)
                 if (message.sender && message.payload) {
                     console.log(`HOOK: Received OFFER from ${message.sender}`);
                     if (pc.current) {
                          console.warn("HOOK: Existing peer connection found on offer receive, closing first.");
                         // Handle this case carefully - maybe ask user or automatically replace?
                         disconnect();
                         await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
                     }
                      setConnectionStatus('connecting');
                     targetPeerId.current = message.sender; // Update target

                     try {
                         pc.current = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
                         setupPeerConnectionEventHandlers(pc.current, message.sender);

                         await pc.current.setRemoteDescription(new RTCSessionDescription(message.payload));
                         console.log('HOOK: Set remote description (offer)');

                         const answer = await pc.current.createAnswer();
                         await pc.current.setLocalDescription(answer);
                         console.log('HOOK: Set local description (answer)');

                         sendSignalingMessage({ type: 'answer', target: message.sender, payload: answer });
                     } catch (err) {
                         handleError('Error handling offer.', err);
                     }
                 }
                 break;

            case 'answer': // Received an answer (Caller role)
                if (message.sender && message.payload && pc.current) {
                    console.log(`HOOK: Received ANSWER from ${message.sender}`);
                    try {
                        await pc.current.setRemoteDescription(new RTCSessionDescription(message.payload));
                        console.log('HOOK: Set remote description (answer)');
                        // ICE negotiation will now proceed
                    } catch (err) {
                        handleError('Error handling answer.', err);
                    }
                }
                break;

            case 'candidate': // Received ICE candidate (Both roles)
                if (message.sender && message.payload && pc.current) {
                     console.log(`HOOK: Received ICE CANDIDATE from ${message.sender}`);
                    try {
                        await pc.current.addIceCandidate(new RTCIceCandidate(message.payload));
                        console.log('HOOK: Added received ICE candidate');
                    } catch (err) {
                        // Ignore benign errors like candidate before remote description set
                        if (err instanceof Error) {
                          if (!err.message.includes("remote description is not set")) {
                               console.warn('HOOK: Error adding received ICE candidate:', err);
                          }
                        } else {
                           console.warn('HOOK: Caught non-Error value when adding ICE candidate:', err);
                        }
                    }
                }
                break;

             case 'user_left':
                  console.log(`HOOK: Server notified that user ${message.payload?.userId} left.`);
                  if (message.payload?.userId === targetPeerId.current) {
                       handleError("The other user disconnected.", null);
                  }
                  break;

            case 'error':
                handleError(`Signaling Server Error: ${message.payload?.message || 'Unknown error'}`, message.payload);
                break;

            // Handle other message types (info, push_registered etc.) if needed
            default:
                console.log(`HOOK: Received unhandled signaling message type: ${message.type}`);
        }
    }, [initiatePeerConnection, disconnect, setupPeerConnectionEventHandlers, sendSignalingMessage]); // Dependencies


    // --- Main Connect Function (Called by Component) ---
    const connect = useCallback((myId: string, targetId: string) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.warn("HOOK: Already connected or connecting.");
            return;
        }

        console.log(`HOOK: Attempting to connect WS (${myId} -> ${targetId}) to ${SIGNALING_SERVER_URL}...`);
        setError(null);
        setConnectionStatus('connecting');
        myUserId.current = myId;
        targetPeerId.current = targetId; // Store target ID for later use

        const socket = new WebSocket(SIGNALING_SERVER_URL);

        socket.onopen = () => {
            console.log('HOOK: WebSocket Connected');
            ws.current = socket;
            // Login to signaling server
            sendSignalingMessage({ type: 'login', payload: { userId: myId } });
            // Don't set status to 'connected' yet, wait for data channel
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleSignalingMessage(message);
            } catch (e) {
                console.error('HOOK: Failed to parse signaling message:', event.data, e);
            }
        };

        socket.onerror = (err) => {
            handleError('WebSocket Error', err);
            ws.current = null; // Ensure ref is cleared on error
        };

        socket.onclose = (event) => {
            console.log('HOOK: WebSocket Closed:', event.code, event.reason);
             if (connectionStatus !== 'error' && connectionStatus !== 'failed') {
                 // Only reset if not already in a failure state
                 resetConnectionState();
             }
            ws.current = null; // Clear ref on close
            // Optional: Implement WebSocket reconnection logic here
        };

    }, [sendSignalingMessage, handleSignalingMessage, connectionStatus]); // Dependencies for connect


    // --- Send Message Function (Called by Component) ---
    const sendMessage = useCallback((message: WebRTCMessage) => {
        if (dataChannel.current && dataChannel.current.readyState === 'open') {
            try {
                const messageString = JSON.stringify(message);
                console.log(`HOOK: Sending DataChannel message: ${messageString}`);
                dataChannel.current.send(messageString);
            } catch (err) {
                 handleError("Failed to send message over data channel.", err);
            }
        } else {
             // Maybe queue message or show error?
            handleError('Cannot send message: Data channel not open.');
            Alert.alert("Send Failed", "Connection is not active.");
        }
    }, []);


    // For cleanup
    useEffect(() => {
        // This runs when the component using the hook unmounts
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        connectionStatus,
        connect,
        disconnect,
        sendMessage,
        lastReceivedMessage,
        error,
    };
}

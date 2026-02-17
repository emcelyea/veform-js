import { Field, VeformBuilder } from './veform-builder';

const DEFAULT_SERVER_URL = 'ws://localhost:8080/ws';
type EventHandlers = {
    /** 
    * Called immediately after start() is called 
    */
    onLoadingStarted?: () => void;
    /** 
     * Called when connections established and conversation begins 
     * This can be treated as a loading finished event
    */
    onRunningStarted?: () => void;
    /** 
     * Called when conversation is complete
    */
    onFinished?: () => void;
    /** 
     * Called when an error occurs. 
     * Veform will attempt to recover from these errors.
    */
    onError?: (error: string) => void;
    /** 
     * Called when a critical error occurs.
     * veform audio will output a generic error and end the conversation when these occur.
    */
    onCriticalError?: (error: string) => void;
    /** 
     * Called when user talking is detected
    */
    onAudioInStart?: () => void;
    /**
     * Called when user done talking is detected
        Returning true blocks veform from processing this input and continuing the conversation.
     * If you block this you must call `changeField` or`emitAudio` to keep the conversation going.
     */
    onAudioInEnd?: (input: string) => boolean;
    /** 
     * Called before audio output starts.
     * Returning true blocks veform from emitting this output and continuing the conversation.
     * If you block this you must call `changeField` or`emitAudio` to keep the conversation going.
    */
    onAudioOutStart?: (chunk: string) => boolean;
    /** 
     * Called when audio output ends
     */
    onAudioOutEnd?: () => void;
    /** 
     * Called when the current field focus changes
     * Returning true blocks veform from changing the field and continuing the conversation.
     * If you block this you must call `changeField` or `emitAudio` to keep the conversation going.
    */
    onFocusChanged?: (previousName: string, nextName: string) => boolean;

    /**
     * Called when an answer is provided to a field
     */
    onFieldValueChanged?: (fieldName: string, answer: string | number | boolean) => void;
}


// this is what exposes all the cancelable events to user
export class Veform {
    private connected: boolean = false;
    private form: {fields: Field[]};
    private eventHandlers: EventHandlers = {};
    private localStream: MediaStream | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private wsConnection: WebSocket | null = null;
    private audioElement: HTMLAudioElement | null = null;
    constructor(fields: Field[] | VeformBuilder) {
        if (fields instanceof VeformBuilder) {
            this.form = {fields: fields.getFields()};
        } else {
            this.form = {fields: fields};
        }
    }

    onLoadingStarted(callback: EventHandlers['onLoadingStarted']) {
        this.eventHandlers.onLoadingStarted = callback;
    }
    onRunningStarted(callback: EventHandlers['onRunningStarted']) {
        this.eventHandlers.onRunningStarted = callback;
    }
    onFinished(callback: EventHandlers['onFinished']) {
        this.eventHandlers.onFinished = callback;
    }
    onError(callback: EventHandlers['onError']) {
        this.eventHandlers.onError = callback;
    }
    onCriticalError(callback: EventHandlers['onCriticalError']) {
        this.eventHandlers.onCriticalError = callback;
    }
    onAudioInStart(callback: EventHandlers['onAudioInStart']) {
        this.eventHandlers.onAudioInStart = callback;
    }
    onAudioInEnd(callback: EventHandlers['onAudioInEnd']) {
        this.eventHandlers.onAudioInEnd = callback;
    }
    onAudioOutStart(callback: EventHandlers['onAudioOutStart']) {
        this.eventHandlers.onAudioOutStart = callback;
    }
    onAudioOutEnd(callback: EventHandlers['onAudioOutEnd']) {
        this.eventHandlers.onAudioOutEnd = callback;
    }
    onFocusChanged(callback: EventHandlers['onFocusChanged']) {
        this.eventHandlers.onFocusChanged = callback;
    }
    onFieldValueChanged(callback: EventHandlers['onFieldValueChanged']) {
        this.eventHandlers.onFieldValueChanged = callback;
    }

    /**
     * Start the conversation
     * This will connect the client the the veform server with the current set of fields
     */
    async start() {
        if (!this.form?.fields || this.form?.fields.length === 0) {
            console.error('No fields provided');
            return false;
        }
        if (this.connected || this.wsConnection || this.peerConnection || this.localStream) {
            console.error('Start already called, try running stop() or creating a new instance');
            return false;
        }
        try {
            this.audioElement = createAudioElement();
            if (this.eventHandlers.onLoadingStarted) {
                this.eventHandlers.onLoadingStarted();
            }
            // get local audio track
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000,
                    channelCount: 1,
                },
                video: false,
            });

            // setup local peerconnection
            this.peerConnection = new RTCPeerConnection();
            this.localStream.getTracks().forEach((track) => {
                if (!this.localStream || !this.peerConnection) {
                    console.error('Local stream or peer connection not established');
                    return;
                }
                this.peerConnection?.addTrack(track, this.localStream);
            });

            this.peerConnection.oniceconnectionstatechange = () => {
                if (this.peerConnection?.iceConnectionState === 'connected') {
                    this.connected = true;
                    console.log('Peer connection connected');
                } else if (this.peerConnection?.iceConnectionState === 'disconnected') {
                    console.log('Peer connection disconnected');
                } else if (this.peerConnection?.iceConnectionState === 'failed') {
                   if (this.eventHandlers.onError) {
                    this.eventHandlers.onError('Connection to server failed');
                   }
                }
            };
            this.peerConnection.ontrack = (event) => {
                if (!this.audioElement) {
                    console.error('Audio element not found');
                    return;
                }
                const stream = event.streams[0];
                this.audioElement.srcObject = stream;
                this.audioElement.play().catch((e) => console.error("Play error:", e));
            };
            // create websocket connection
            this.wsConnection = new WebSocket(DEFAULT_SERVER_URL);
            this.wsConnection.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (!this.peerConnection) {
                    console.error('WS response, Peer connection not established');
                    return;
                }
                if (message.type === "answer") {
                  const answer = new RTCSessionDescription(message.payload);
                  this.peerConnection.setRemoteDescription(answer);
                } else if (message.type === "ice-candidate") {
                  const candidate = new RTCIceCandidate(message.payload);
                  this.peerConnection.addIceCandidate(candidate);
                } else {
                    this.resolveWsMessage(message);
                }
            }
            
            this.wsConnection.onopen = async() => {
                if (!this.peerConnection) {
                    console.error('Peer connection not established');
                    return;
                }
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                      this.wsConnection?.send(
                        JSON.stringify({
                          type: "ice-candidate",
                          payload: event.candidate,
                        }),
                      );
                    }
                };
                this.wsConnection?.send(JSON.stringify({
                    type: "offer",
                    payload: this.peerConnection?.localDescription,
                }));
                this.wsConnection?.send(JSON.stringify({
                    type: "form",
                    payload: this.form,
                }));

                
            };
  
            return true;
        } catch (error) {
            console.error('Error starting conversation:', error);
            this.connected = false;
            this.wsConnection = null;
            this.peerConnection = null;
            this.localStream = null;
            return false;
        }
    }
    /**
     * Stop the conversation, this will cut off audio mid output
     */
    stop() {
        console.log('Stop called');
        if (!this.connected) {
            console.error('Not connected to veform server');
            return;
        }
        this.connected = false;
        this.wsConnection?.close();
        this.wsConnection = null;
        this.peerConnection?.close();
        this.peerConnection = null;
        this.localStream?.getTracks().forEach((track) => {
            track.stop();
        });
        this.localStream = null;
    }

    /**
     * Emit audio to client
     * interrupt: if true, will interrupt the current output, otherwise will be queued behind current audio
     */
    emitAudio(audio: string, interrupt: boolean = false) {
        console.log('Emit audio called', audio);
    }

    /**
     * Change the current field
     * This will change the current field to the one provided
     */
    changeField(fieldName: string, interrupt: boolean = false) {
        console.log('Change field called', fieldName, interrupt);
    }

    /**
     * Stop current audio output
     */
    interrupt() {
        console.log('Interrupt called');
    }

    private resolveWsMessage(message: any) {
        switch (message.type) {
            case "event-start":
                if (this.eventHandlers.onRunningStarted) {
                    this.eventHandlers.onRunningStarted();
                }
                return;
            case "event-end":
                if (this.eventHandlers.onFinished) {
                    this.eventHandlers.onFinished();
                }
                return;
            case "event-audio-out-start":
                if (this.eventHandlers.onAudioOutStart) {
                    const interrupt = this.eventHandlers.onAudioOutStart(message.payload);
                    if (interrupt) {
                        console.log('Audio out start interrupted');
                    }
                }
                return;
            case "event-audio-out-end":
                if (this.eventHandlers.onAudioOutEnd) {
                    this.eventHandlers.onAudioOutEnd();
                }
                return;
            case "event-input-start":
                if (this.eventHandlers.onAudioInStart) {
                    this.eventHandlers.onAudioInStart();
                }
                return;
            case "event-input-end":
                if (this.eventHandlers.onAudioInEnd) {
                    const interrupt = this.eventHandlers.onAudioInEnd(message.payload);
                    if (interrupt) {
                        console.log('Audio in end interrupted');
                    }
                }
                return;
            case "event-focus-changed":
                if (this.eventHandlers.onFocusChanged) {
                    const interrupt = this.eventHandlers.onFocusChanged(message.payload.previousName, message.payload.nextName);
                    if (interrupt) {
                        console.log('Focus changed interrupted');
                    }
                }
                return;
            case "event-field-resolved":
                if (this.eventHandlers.onFieldValueChanged) {
                    this.eventHandlers.onFieldValueChanged(message.payload.fieldName, message.payload.answer);
                }
                return;
            case "event-error":
                if (this.eventHandlers.onError) {
                    this.eventHandlers.onError(message.payload);
                }
                return;
            case "event-critical-error":
                if (this.eventHandlers.onCriticalError) {
                    this.eventHandlers.onCriticalError(message.payload);
                    this.stop();
                }
                return;
            default:
                console.error('Unknown event type:', message.type);
                break;
        }
    }
}


function createAudioElement() {
    const element = document.createElement('audio');
    element.id = 'veform-audio';
    element.style.opacity = '0';
    element.style.position = 'absolute';
    element.style.bottom = '0';
    element.style.right = '0';
    element.style.width = '100%';
    element.style.height = '100%';
    document.body.appendChild(element);
    return element;
}
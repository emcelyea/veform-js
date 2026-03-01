import { Field, VeformBuilder } from './veform-builder';

const DEFAULT_SERVER_URL = 'wss://api.veform.co/veform-api/ws';
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


export class Veform {
    private connected: boolean = false;
    private form: {fields: Field[]};
    private eventHandlers: EventHandlers = {};
    private localStream: MediaStream | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private wsConnection: WebSocket | null = null;
    private audioElement: HTMLAudioElement | null = null;
    public debug: boolean = false;
    public verbose: boolean = false;
    constructor(fields: Field[] | VeformBuilder) {
        let form: {fields: Field[]};
        if (fields instanceof VeformBuilder) {
            this.form = {fields: fields.getFields()};
        } else if (Array.isArray(fields)) {
            this.form = {fields: fields};
        } else {
            this.log(`Invalid form fields provided`, 'error');
            this.form = {fields: []};
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
    onFieldValueChanged(callback: EventHandlers['onFieldValueChanged']) {
        this.eventHandlers.onFieldValueChanged = callback;
    }
    onFocusChanged(callback: EventHandlers['onFocusChanged']) {
        this.eventHandlers.onFocusChanged = callback;
    }


    /**
     * Start the conversation
     * This will connect the client the the veform server with the current set of fields
     */
    async start(token: string) {
        if (!this.form?.fields || this.form?.fields.length === 0) {
            this.log('No fields provided', 'error');
            return false;
        }

        if (this.connected || this.wsConnection || this.peerConnection || this.localStream) {
            this.log('start called while already running', 'error');
            return false;
        }
        if (this.eventHandlers.onLoadingStarted) {
            this.eventHandlers.onLoadingStarted();
        }
        try {
            if (token.startsWith('http')) {
                this.log(`Fetching token from URL: ${token}`, 'debug');
                token = await fetch(token, { method: 'POST' }).then(response => response.json()).then(data => data.token || data);
                this.log(`Fetched token from URL: ${token}`, 'debug');
            }
            if (!token) {
                this.log('No token provided or returned from token URL', 'error');
                if (this.eventHandlers.onCriticalError) {
                    this.eventHandlers.onCriticalError('No token provided or returned from token URL');
                } else if (this.eventHandlers.onError) {
                    this.eventHandlers.onError('No token provided or returned from token URL');
                }
                return false;
            }
            this.audioElement = createAudioElement();
   
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
            this.peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            this.localStream.getTracks().forEach((track) => {
                if (!this.localStream) {
                    this.log('Local stream failed to get user media', 'error');
                    return;
                }
                if (!this.peerConnection) {
                    this.log('Peer connection failed to create', 'error');
                    return;
                }
                this.peerConnection?.addTrack(track, this.localStream);
            });

            this.peerConnection.oniceconnectionstatechange = () => {
                this.log(`ICE connection state changed to: ${this.peerConnection?.iceConnectionState}`, 'debug');
                if (this.peerConnection?.iceConnectionState === 'connected') {
                    this.connected = true;
                    this.log('Peer connection connected', 'debug');
                } else if (this.peerConnection?.iceConnectionState === 'disconnected') {
                    this.log('Peer connection disconnected', 'debug');
                } else if (this.peerConnection?.iceConnectionState === 'failed') {
                   if (this.eventHandlers.onCriticalError) {
                    this.eventHandlers.onCriticalError('Connection to server failed');
                   } else if (this.eventHandlers.onError) {
                    this.eventHandlers.onError('Connection to server failed');
                   }
                   this.log('Connection to server failed, stopping conversation', 'error');
                   this.stop();
                }
            };
            this.peerConnection.ontrack = (event) => {
                if (!this.audioElement) {
                    this.log('Audio element not found', 'error');
                    return;
                }
                const stream = event.streams[0];
                this.audioElement.srcObject = stream;
                this.audioElement.play().catch((e) => this.log(`Audio element play error: ${e}`, 'error'));
            };

            this.wsConnection = new WebSocket(DEFAULT_SERVER_URL + '?token=' + token);
            this.wsConnection.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (!this.peerConnection) {
                    this.log('WS response, Peer connection not established', 'error');
                    return;
                }
                if (message.type === "answer") {
                  const answer = new RTCSessionDescription(message.payload);
                  this.log(`RTC: Received answer from server`, 'debug');
                  this.peerConnection.setRemoteDescription(answer);
                } else if (message.type === "ice-candidate") {
                  const candidate = new RTCIceCandidate(message.payload);
                  this.log(`RTC: Received candidate from server`, 'debug');
                  this.peerConnection.addIceCandidate(candidate);
                } else {
                    this.resolveWsMessage(message);
                }
            }
            
            this.wsConnection.onopen = async() => {
                if (!this.peerConnection) {
                    this.log('WS response, Peer connection not established', 'error');
                    return;
                }
                const offer = await this.peerConnection.createOffer();
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                      this.log(`RTC: Sending candidate to server`, 'debug');
                      this.wsConnection?.send(
                        JSON.stringify({
                          type: "ice-candidate",
                          payload: event.candidate,
                        }),
                      );
                    }
                };
                await this.peerConnection.setLocalDescription(offer);
                this.log(`RTC: Sending offer to server`, 'debug');
                this.wsConnection?.send(JSON.stringify({
                    type: "offer",
                    payload: this.peerConnection?.localDescription,
                }));
                this.log(`RTC: Sending form to server`, 'debug');
                this.wsConnection?.send(JSON.stringify({
                    type: "form",
                    payload: this.form,
                }));
            };
  
            return true;
        } catch (error) {
            this.log(`Error starting conversation: ${error}`, 'error');
            if (this.eventHandlers.onCriticalError) {
                this.eventHandlers.onCriticalError(`Error starting conversation: ${error}`);
            } else if (this.eventHandlers.onError) {
                this.eventHandlers.onError(`Error starting conversation: ${error}`);
            }
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
        this.log('Stop called', 'debug');
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
        this.log(`Emit audio called: ${audio}`, 'debug');

        if (!this.connected) {
            this.log('EmitAudio called before connection was established', 'error');
            return;
        }
    }

    /**
     * Change the current field
     * This will change the current field to the one provided, the question for that field will be emitted.
     * We recommend leading this with `emitAudio('we have to go back to ____', true), to interrupt current output, and provide some context to user
     */
    changeField(fieldName: string) {
        this.log(`Change field called: ${fieldName}`, 'debug');
        if (!this.connected) {
            this.log('Change field called before connection was established', 'error');
            return;
        }
    }

    /**
     * Stop current audio output
     */
    interrupt() {
        this.log('Interrupt called', 'debug');
        if (!this.connected) {
            this.log('Interrupt called before connection was established', 'error');
            return;
        }
    }

    private resolveWsMessage(message: any) {
        this.log(`WS message received: ${message.type}, ${this.verbose ? `Payload: ${JSON.stringify(message.payload)}` : ''}`, 'debug');
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
                        this.log('Audio out start interrupted', 'debug');
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
                        this.log('Focus changed interrupted', 'debug');
                        return;
                    }
                }
                const nextField  = this.form.fields.find((field) => field.name === message.payload.nextName);
                if (nextField?.eventHandlers?.onFocus) {
                    nextField.eventHandlers.onFocus(message.payload.previousName);
                }
                return;
            case "event-field-value-changed":
                const field = this.form.fields.find((field) => field.name === message.payload.fieldName);
                if (field?.eventHandlers?.onChange) {
                    field.eventHandlers.onChange(message.payload.value);
                }
                if (this.eventHandlers.onFieldValueChanged) {
                    this.eventHandlers.onFieldValueChanged(message.payload.fieldName, message.payload.value);
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
                this.log(`Unknown event type: ${message.type}`, 'error');
                break;
        }
    }
    
    private colors = {
        error: '#ff6b6b',
        warn:  '#ffd166',
        debug: '#74b9ff',
    }

    private log(message: string, type: 'error' | 'warn' | 'debug') {
        if (type) {
            const color = this.colors[type];
            if (type === 'debug' && !this.debug && !this.verbose) {
                return;
            }
            console.log(`%cVeform: ${message}`, `color:${color}`);
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
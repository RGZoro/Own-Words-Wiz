import { GameState, StudentResponse, NetworkMessage, LogEntry } from '../types';
import { Peer, DataConnection } from 'peerjs';

const STORAGE_KEY = 'own_words_wiz_state';
const APP_PREFIX = 'oww-v1-';

// Simplified STUN list. Too many servers causes timeouts on mobile.
// Google's STUN servers are the gold standard for free reliability.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Initial state
const initialState: GameState = {
  prompt: '',
  maxScore: 2,
  isAcceptingAnswers: false,
  students: {},
  projectorDisplay: { type: 'prompt' },
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * GameService handles the game logic and networking.
 */
class GameService {
  private state: GameState;
  private listeners: ((state: GameState) => void)[] = [];
  private logListeners: ((logs: LogEntry[]) => void)[] = [];
  
  // PeerJS
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private isHost: boolean = false;
  public connectionStatus: ConnectionStatus = 'disconnected';
  private logs: LogEntry[] = [];
  private heartbeatInterval: any = null;

  constructor() {
    // Try to load state from local storage for persistence across reloads (Teacher only)
    const saved = localStorage.getItem(STORAGE_KEY);
    this.state = saved ? JSON.parse(saved) : initialState;

    // Listener for local tab sync (legacy/backup support)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        // Only merge if we are not the host, or if we are just starting up
        if (!this.isHost) {
           this.state = JSON.parse(e.newValue);
           this.notifyListeners();
        }
      }
    });
    
    this.addLog('info', 'Service initialized (v1.0.1)');
  }

  // --- Logging ---
  private addLog(type: 'info' | 'error' | 'success', message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    this.logs.unshift(entry); // Add to top
    // Limit logs
    if (this.logs.length > 200) this.logs = this.logs.slice(0, 200);
    this.logListeners.forEach(l => l([...this.logs]));
    
    if (type === 'error') console.error(message);
    else console.log(`[${type.toUpperCase()}] ${message}`);
  }

  public getLogs(): LogEntry[] {
    return this.logs;
  }

  public subscribeLogs(callback: (logs: LogEntry[]) => void): () => void {
    this.logListeners.push(callback);
    callback([...this.logs]);
    return () => {
      this.logListeners = this.logListeners.filter(l => l !== callback);
    };
  }

  // --- State Management ---

  public getState(): GameState {
    return this.state;
  }

  public subscribe(callback: (state: GameState) => void): () => void {
    this.listeners.push(callback);
    callback(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private persist() {
    // Save to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    
    // Broadcast to peers if we are host
    if (this.isHost) {
      this.broadcast({ type: 'SYNC_STATE', payload: this.state });
    }
    
    this.notifyListeners();
  }

  private notifyListeners() {
    // We send a shallow copy
    const stateCopy = { ...this.state };
    this.listeners.forEach((l) => l(stateCopy));
  }

  private broadcast(msg: NetworkMessage) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  // --- Networking: Teacher (Host) ---

  public async startNewClass(): Promise<string> {
    this.addLog('info', 'Starting new class...');
    this.stopHeartbeat();
    
    // 1. Disconnect existing peer
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections = [];
    
    // 2. Clear room code in state
    this.state = {
      ...initialState,
      roomCode: undefined, 
    };
    this.persist();

    // 3. Start hosting again
    return this.startHosting();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
        // Monitor PeerJS signaling connection
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
            this.addLog('info', 'Signaling lost. Reconnecting...');
            this.peer.reconnect();
        }
    }, 3000); // Check more frequently
  }

  private stopHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  public async startHosting(): Promise<string> {
    this.isHost = true;
    this.connectionStatus = 'connecting';
    this.addLog('info', 'Initializing Host...');
    
    // Reuse existing code if available, or generate new
    const code = this.state.roomCode || Math.random().toString(36).substring(2, 6).toUpperCase();
    const fullId = APP_PREFIX + code;
    
    this.state = { ...this.state, roomCode: code };
    this.persist();

    return new Promise((resolve) => {
      try {
        if (this.peer && !this.peer.destroyed) {
            this.addLog('info', 'Peer already active, reusing.');
            this.connectionStatus = 'connected';
            this.startHeartbeat();
            resolve(code);
            return;
        }

        // Host configuration
        this.peer = new Peer(fullId, {
            debug: 1, // Reduced debug level to reduce console noise
            secure: true,
            config: { iceServers: ICE_SERVERS }
        });

        this.peer.on('open', (id) => {
          this.addLog('success', `Host Online. ID: ${id}`);
          this.connectionStatus = 'connected';
          this.startHeartbeat();
          resolve(code);
        });

        this.peer.on('connection', (conn) => {
          this.addLog('info', `Student connecting: ${conn.peer}`);
          
          conn.on('open', () => {
             this.addLog('success', `Student joined: ${conn.peer}`);
             this.connections.push(conn);
             
             // Small delay to ensure connection is stable before sending payload
             setTimeout(() => {
                 conn.send({ type: 'SYNC_STATE', payload: this.state });
             }, 100);
          });

          conn.on('data', (data: any) => {
            this.handleMessage(data);
          });
          
          conn.on('close', () => {
             // this.addLog('info', `Student disconnected: ${conn.peer}`);
             this.connections = this.connections.filter(c => c !== conn);
          });

          conn.on('error', (err) => {
             this.addLog('error', `Connection error with student: ${err}`);
          });
        });

        this.peer.on('error', (err) => {
          this.addLog('error', `Host Peer Error: ${err.type}`);
          
          if (err.type === 'unavailable-id') {
             this.addLog('info', 'ID taken, recovering session.');
             this.connectionStatus = 'connected';
             this.startHeartbeat();
             resolve(code);
             return;
          }
          
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
             this.connectionStatus = 'error';
          }
          resolve(code);
        });

        this.peer.on('disconnected', () => {
            this.addLog('error', 'Host disconnected from cloud. Auto-reconnecting...');
            if (this.peer && !this.peer.destroyed) {
                this.peer.reconnect();
            }
        });

      } catch (e: any) {
        this.addLog('error', `Exception in startHosting: ${e.message}`);
        this.connectionStatus = 'error';
        resolve(code);
      }
    });
  }

  // --- Networking: Student (Client) ---

  public async joinGame(code: string, studentName: string): Promise<boolean> {
    this.isHost = false;
    const fullId = APP_PREFIX + code.toUpperCase();
    this.addLog('info', `Attempting to join room: ${code}`);

    return new Promise((resolve, reject) => {
      try {
          if (this.peer) this.peer.destroy();
          
          const peer = new Peer({
              secure: true,
              config: { iceServers: ICE_SERVERS }
          });
          
          peer.on('open', (id) => {
            this.addLog('info', `Client Peer ID generated. Connecting to Host...`);
            
            // Connect to host with lighter config for mobile
            const conn = peer.connect(fullId, { 
                serialization: 'json',
                metadata: { name: studentName }
            });
            
            conn.on('open', () => {
              this.addLog('success', 'Connected to Teacher!');
              this.peer = peer;
              this.connections = [conn];
              // Send join request immediately
              conn.send({ type: 'JOIN_REQUEST', payload: { name: studentName } });
              resolve(true);
            });

            conn.on('data', (data: any) => {
              const msg = data as NetworkMessage;
              if (msg.type === 'SYNC_STATE') {
                this.state = msg.payload;
                this.notifyListeners();
              }
              // Handle Force Reset
              if (msg.type === 'RESET_FORM') {
                  this.notifyReset();
              }
            });

            conn.on('close', () => {
                this.addLog('error', 'Disconnected from Teacher.');
            });

            conn.on('error', (err) => {
              this.addLog('error', `Conn Error: ${err}`);
            });
            
            // Timeout safety
            setTimeout(() => {
              if (!conn.open) {
                  this.addLog('error', 'Connection timed out. Firewalls may be blocking P2P.');
                  reject(new Error("Connection timed out."));
              }
            }, 10000);
          });

          peer.on('error', (err) => {
            this.addLog('error', `Client Peer Error: ${err.type}`);
            if (err.type === 'peer-unavailable') {
                reject(new Error("Class not found. Check code."));
            } else {
                reject(err);
            }
          });
      } catch (e: any) {
          this.addLog('error', `Join Exception: ${e.message}`);
          reject(e);
      }
    });
  }

  private handleMessage(msg: NetworkMessage) {
    if (!this.isHost) return;

    if (msg.type === 'SUBMIT_ANSWER') {
      const { name, text } = msg.payload;
      this.addLog('info', `Received answer from ${name}`);
      this.addAnswerInternal(name, text);
    }
  }

  // --- Actions ---

  // Called by Student View
  public sendAnswer(studentName: string, text: string) {
    if (this.isHost) {
       this.addAnswerInternal(studentName, text);
    } else {
       if (this.connections[0]?.open) {
         this.connections[0].send({ type: 'SUBMIT_ANSWER', payload: { name: studentName, text } });
       } else {
           this.addLog('error', 'Cannot send answer: Disconnected');
       }
    }
  }
  
  // Custom event for Reset
  private resetListeners: (() => void)[] = [];
  public subscribeReset(callback: () => void): () => void {
      this.resetListeners.push(callback);
      return () => { this.resetListeners = this.resetListeners.filter(l => l !== callback); };
  }
  private notifyReset() {
      this.resetListeners.forEach(l => l());
  }

  // Internal Logic
  private addAnswerInternal(studentName: string, text: string) {
    const id = studentName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const response: StudentResponse = {
      id,
      studentName,
      text,
      submittedAt: Date.now(),
      score: null,
    };
    // Immutable update
    this.state = {
      ...this.state,
      students: { ...this.state.students, [id]: response }
    };
    this.persist();
    return id;
  }

  // Teacher Actions
  public setPrompt(prompt: string, maxScore: number = 2) {
    this.state = {
        ...this.state,
        prompt,
        maxScore,
        isAcceptingAnswers: true,
        projectorDisplay: { type: 'prompt' }
    };
    this.persist();
  }

  public resetRound() {
      this.addLog('info', 'Resetting round (clearing answers).');
      this.state = {
          ...this.state,
          students: {}, // Clear all answers
          isAcceptingAnswers: true,
          projectorDisplay: { type: 'prompt' }
      };
      this.persist();
      
      // Send specific command to clear client inputs
      if (this.isHost) {
          // Send multiple times to ensure delivery over UDP/Mobile
          this.broadcast({ type: 'RESET_FORM' } as any);
          setTimeout(() => this.broadcast({ type: 'RESET_FORM' } as any), 500);
          setTimeout(() => this.broadcast({ type: 'RESET_FORM' } as any), 1000);
      }
  }

  public toggleAccepting(accepting: boolean) {
    this.state = { ...this.state, isAcceptingAnswers: accepting };
    this.persist();
  }

  public setProjectorView(type: 'prompt' | 'answer', answerId?: string) {
    this.state = { 
        ...this.state, 
        projectorDisplay: { type, contentId: answerId } 
    };
    this.persist();
  }

  public updateStudentScore(id: string, score: number) {
    if (this.state.students[id]) {
      this.state = {
          ...this.state,
          students: {
              ...this.state.students,
              [id]: { ...this.state.students[id], score }
          }
      };
      this.persist();
    }
  }

  public updateStudentAiData(id: string, score: number, feedback: string) {
    if (this.state.students[id]) {
       this.state = {
          ...this.state,
          students: {
              ...this.state.students,
              [id]: { ...this.state.students[id], aiSuggestedScore: score, aiFeedback: feedback }
          }
       };
      this.persist();
    }
  }
  
  public addDemoStudents() {
    const demos = [
      { name: "Sarah J.", text: "The writer conveys the intensity by using the word 'battered' to describe the wind against the walls." },
      { name: "Mike T.", text: "It was very windy and loud outside." },
      { name: "David L.", text: "The text says 'the wind battered the walls' which shows it was strong." },
      { name: "Emma W.", text: "By using the metaphor of a 'wild beast', the writer suggests the storm was uncontrollable." }
    ];

    demos.forEach((d) => {
      this.addAnswerInternal(d.name, d.text);
    });
  }

  public resetGame() {
    const code = this.state.roomCode; 
    this.state = { 
        ...initialState, 
        roomCode: code, 
        students: {} 
    };
    this.persist();
  }
}

export const backend = new GameService();
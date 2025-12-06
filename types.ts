export type Role = 'teacher' | 'student' | 'projector' | null;

export interface StudentResponse {
  id: string;
  studentName: string;
  text: string;
  submittedAt: number;
  score: number | null; // 0 to maxScore, or null if ungraded
  aiFeedback?: string;
  aiSuggestedScore?: number;
}

export interface GameState {
  roomCode?: string; // The 4-character code for students to join
  prompt: string;
  maxScore: number; // Configurable max points for the current prompt
  isAcceptingAnswers: boolean;
  students: Record<string, StudentResponse>;
  projectorDisplay: {
    type: 'prompt' | 'answer';
    contentId?: string; // If displaying an answer
  };
}

// Network Message Types
export type NetworkMessage = 
  | { type: 'SYNC_STATE'; payload: GameState }
  | { type: 'SUBMIT_ANSWER'; payload: { name: string; text: string } }
  | { type: 'JOIN_REQUEST'; payload: { name: string } };

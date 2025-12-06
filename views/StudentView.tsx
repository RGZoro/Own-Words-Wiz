
import React, { useState, useEffect } from 'react';
import { backend } from '../services/mockBackend';
import { GameState, StudentResponse } from '../types';
import { Button } from '../components/Button';

export const StudentView: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(backend.getState());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false); // Local tracking for immediate UI feedback

  useEffect(() => {
    return backend.subscribe(setGameState);
  }, []);

  // Wake Lock for mobile devices (iPads)
  useEffect(() => {
    if (hasJoined && 'wakeLock' in navigator) {
      let wakeLock: any = null;
      const requestWakeLock = async () => {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock denied:', err);
        }
      };
      requestWakeLock();
      
      const handleVisibilityChange = () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        if (wakeLock) wakeLock.release();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [hasJoined]);

  const handleJoin = async () => {
    if (!name.trim() || !code.trim() || code.length !== 4) return;
    
    setIsJoining(true);
    setJoinError('');
    
    try {
      await backend.joinGame(code, name);
      setHasJoined(true);
    } catch (e: any) {
      setJoinError('Could not find class. Check the code.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleSubmit = () => {
    if (!answer.trim()) return;
    setIsSubmitting(true);
    backend.sendAnswer(name, answer);
    
    // Simulate slight network delay for better UX feel
    setTimeout(() => {
        setIsSubmitted(true);
        setIsSubmitting(false);
    }, 500);
  };

  // Find my submission in the synced state to show score/feedback
  // We match by name for simplicity in this demo, though IDs are safer
  const mySubmission = (Object.values(gameState.students) as StudentResponse[]).find(s => s.studentName === name);

  // Render: Join Screen
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Join Class</h1>
            <p className="text-gray-500">Enter your name and the 4-digit code on the board.</p>
          </div>
          
          <div className="space-y-4">
            <div>
                <input
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-center text-lg border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all mb-3"
                />
                <input
                  type="text"
                  placeholder="Class Code (e.g. AB12)"
                  value={code}
                  maxLength={4}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full text-center text-2xl font-mono tracking-widest border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all uppercase"
                />
            </div>
            
            {joinError && <p className="text-red-500 text-sm">{joinError}</p>}
            
            <Button 
                onClick={handleJoin} 
                disabled={!name.trim() || code.length < 4} 
                isLoading={isJoining}
                className="w-full py-3 text-lg"
            >
              Join
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render: Main Student Interface
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex flex-col">
            <span className="font-bold text-gray-900">{name}</span>
            <span className="text-xs text-gray-400">Room: {code}</span>
        </div>
        <div className="flex items-center gap-2">
           {mySubmission?.score !== null && mySubmission?.score !== undefined && (
             <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                mySubmission.score === gameState.maxScore ? 'bg-green-100 text-green-700' :
                mySubmission.score > 0 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
             }`}>
               {mySubmission.score}/{gameState.maxScore} Pts
             </span>
           )}
           <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">STUDENT</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex flex-col justify-center">
        {!gameState.prompt ? (
          <div className="text-center py-20 opacity-50">
             <div className="animate-pulse text-6xl mb-4">⏳</div>
             <h2 className="text-xl font-medium">Waiting for teacher...</h2>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
              <h3 className="text-indigo-200 text-sm font-bold uppercase tracking-wider mb-2">Question (Max {gameState.maxScore} Pts)</h3>
              <p className="text-xl md:text-2xl font-medium leading-relaxed">{gameState.prompt}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              {isSubmitted || mySubmission ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Answer Submitted!</h3>
                  <p className="text-gray-500 mb-6">Waiting for the teacher to review.</p>
                  
                  <div className="bg-gray-50 p-4 rounded-lg text-left border border-gray-100">
                    <span className="text-xs text-gray-400 uppercase font-bold">Your Answer:</span>
                    <p className="text-gray-800 mt-1">{mySubmission?.text || answer}</p>
                  </div>
                  
                  {gameState.isAcceptingAnswers && (
                    <button 
                      onClick={() => { setIsSubmitted(false); }}
                      className="mt-6 text-indigo-600 text-sm font-medium hover:underline"
                    >
                      Edit Submission
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700">Write your answer in your own words</label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={!gameState.isAcceptingAnswers}
                    className="w-full h-40 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-lg"
                    placeholder="Type your response here..."
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">
                      {gameState.isAcceptingAnswers ? 'Accepting Answers' : 'Submissions Closed'}
                    </span>
                    <Button 
                      onClick={handleSubmit} 
                      isLoading={isSubmitting}
                      disabled={!gameState.isAcceptingAnswers || !answer.trim()}
                      className="px-8 py-3 text-lg"
                    >
                      Submit Answer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

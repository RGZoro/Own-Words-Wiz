
import React, { useState, useEffect } from 'react';
import { backend, ConnectionStatus } from '../services/mockBackend';
import { GameState, StudentResponse } from '../types';
import { Button } from '../components/Button';
import { evaluateAnswer } from '../services/geminiService';
import { ProjectorView } from './ProjectorView';

export const TeacherDashboard: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(backend.getState());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(backend.connectionStatus);
  const [newPrompt, setNewPrompt] = useState('');
  const [newMaxScore, setNewMaxScore] = useState(2);
  // Initialize API Key from LocalStorage if available
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || process.env.API_KEY || '');
  const [grading, setGrading] = useState<Record<string, boolean>>({}); 
  const [internalProjectorOpen, setInternalProjectorOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Start hosting immediately if not already hosting
    if (!backend.getState().roomCode) {
      backend.startHosting().then(() => {
          setConnectionStatus(backend.connectionStatus);
      }).catch(console.error);
    } else {
        // If we already have a code (from localstorage), check if we are actually connected
        if (backend.connectionStatus === 'disconnected') {
             backend.startHosting().then(() => setConnectionStatus(backend.connectionStatus));
        }
    }
    
    // Poll status occasionally to ensure UI is in sync
    const interval = setInterval(() => {
        setConnectionStatus(backend.connectionStatus);
    }, 2000);

    // Subscribe immediately to state changes
    const unsubscribe = backend.subscribe(setGameState);

    return () => {
        clearInterval(interval);
        unsubscribe();
    };
  }, []); 

  // Save API Key to LocalStorage whenever it changes
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
    }
  }, [apiKey]);

  const handleLaunchProjectorPopup = () => {
    const width = 1024;
    const height = 768;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    // Using URL API for absolute path safety
    const url = new URL(window.location.href);
    url.hash = 'projector';
    
    window.open(
      url.toString(), 
      'ProjectorView', 
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  };

  const handleSetPrompt = () => {
    if (!newPrompt.trim()) return;
    const validMaxScore = Math.max(1, newMaxScore);
    backend.setPrompt(newPrompt, validMaxScore);
    setNewPrompt('');
  };

  const handleAiGrade = async (studentId: string, answer: string) => {
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the settings first.");
      return;
    }
    setGrading(prev => ({ ...prev, [studentId]: true }));
    const result = await evaluateAnswer(apiKey, gameState.prompt, answer, gameState.maxScore);
    backend.updateStudentAiData(studentId, result.score, result.feedback);
    setGrading(prev => ({ ...prev, [studentId]: false }));
  };

  const sortedStudents = (Object.values(gameState.students) as StudentResponse[]).sort((a, b) => b.submittedAt - a.submittedAt);

  if (internalProjectorOpen) {
    return <ProjectorView onClose={() => setInternalProjectorOpen(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-indigo-600">Own Words Wiz</span>
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full font-semibold">TEACHER</span>
            </div>
            
            {/* Room Code Display */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center bg-gray-900 text-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-xs text-gray-400 uppercase font-bold mr-2 tracking-wider">Class Code:</span>
                {gameState.roomCode ? (
                    <span className="text-xl font-mono font-bold tracking-widest text-green-400">{gameState.roomCode}</span>
                ) : (
                    <span className="text-sm text-gray-400 animate-pulse">Generating...</span>
                )}
                </div>
                {connectionStatus === 'offline_mode' && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200" title="WebRTC connection failed. Remote students cannot join.">
                        ⚠ Offline Mode
                    </span>
                )}
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto">
             <input 
              type="password" 
              placeholder="Gemini API Key" 
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-32 md:w-40 focus:ring-indigo-500 focus:border-indigo-500"
            />
             <Button variant="ghost" onClick={() => setShowHelp(true)} className="text-gray-500 hover:text-indigo-600 px-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </Button>
            <Button variant="ghost" onClick={() => backend.addDemoStudents()} className="text-indigo-600 hover:bg-indigo-50 flex whitespace-nowrap">
              + Simulate
            </Button>
            
            <div className="flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setInternalProjectorOpen(true)}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-l-lg hover:bg-gray-100 hover:text-indigo-700 focus:z-10 focus:ring-2 focus:ring-indigo-700 focus:text-indigo-700"
              >
                Projector (Tab)
              </button>
              <button
                type="button"
                onClick={handleLaunchProjectorPopup}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-l-0 border-gray-200 rounded-r-lg hover:bg-gray-100 hover:text-indigo-700 focus:z-10 focus:ring-2 focus:ring-indigo-700 focus:text-indigo-700"
                title="Open in new window"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </button>
            </div>

            <Button variant="ghost" onClick={() => backend.resetGame()} className="text-red-500 hover:text-red-700 hover:bg-red-50">
              Reset
            </Button>
          </div>
        </div>
      </header>

      {/* Setup Guide Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Setup Guide</h2>
            <div className="space-y-4 text-gray-600 overflow-y-auto max-h-[60vh]">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="font-bold text-indigo-700 mb-2">1. Get AI Grading Working</h3>
                <p className="text-sm">To use the AI grading features, you need a free API key from Google.</p>
                <ol className="list-decimal ml-5 text-sm mt-2 space-y-1">
                  <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Google AI Studio</a>.</li>
                  <li>Click "Create API Key".</li>
                  <li>Copy the key and paste it into the box in the top header.</li>
                  <li>It will be saved on this device for next time.</li>
                </ol>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-bold text-green-700 mb-2">2. Deploy for Classroom Use</h3>
                <p className="text-sm">To use this with iPads/Laptops in class:</p>
                <ul className="list-disc ml-5 text-sm mt-2 space-y-1">
                  <li><strong>Vercel / Netlify:</strong> Deploy the code to Vercel/Netlify. <strong>Private GitHub repositories are supported on free plans.</strong></li>
                  <li><strong>GitHub Pages:</strong> Requires a Public repository for the free tier.</li>
                  <li><strong>Free Hosting:</strong> It works 100% free on these platforms. No backend server is required (it uses PeerJS for direct connections).</li>
                </ul>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-bold text-yellow-700 mb-2">3. Troubleshooting</h3>
                <p className="text-sm">If students can't join:</p>
                <ul className="list-disc ml-5 text-sm mt-2 space-y-1">
                  <li>Ensure "Class Code" is visible and green.</li>
                  <li>If it says "Offline Mode", the school network might be blocking WebRTC. Try using a mobile hotspot or guest Wi-Fi.</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 text-right">
              <Button onClick={() => setShowHelp(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Controls & Prompt */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Activity</h2>
            
            {gameState.prompt ? (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Active Prompt</span>
                    <span className="text-xs font-semibold bg-white px-2 py-0.5 rounded text-gray-500 border border-indigo-100">Max Pts: {gameState.maxScore}</span>
                  </div>
                  <p className="mt-1 text-lg font-medium text-gray-800">{gameState.prompt}</p>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    className="w-full" 
                    variant={gameState.isAcceptingAnswers ? "danger" : "primary"}
                    onClick={() => backend.toggleAccepting(!gameState.isAcceptingAnswers)}
                  >
                    {gameState.isAcceptingAnswers ? "Stop Submissions" : "Resume Submissions"}
                  </Button>
                  <Button variant="secondary" onClick={() => backend.setProjectorView('prompt')}>
                    Show Prompt
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p>No active prompt.</p>
              </div>
            )}
            
            <div className="mt-6 border-t pt-6">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">New Question / Prompt</label>
              </div>
              
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px] p-3 border mb-3"
                placeholder="Enter a passage or question..."
              />
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                  <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Max Points:</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="100" 
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(parseInt(e.target.value) || 2)}
                    className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm font-bold"
                  />
                </div>
                <Button onClick={handleSetPrompt} disabled={!newPrompt.trim()} className="flex-1">
                  Post Prompt
                </Button>
              </div>
            </div>
          </div>

           <div className="bg-white rounded-xl shadow p-6">
             <h3 className="font-semibold text-gray-700">Quick Stats</h3>
             <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-bold text-gray-900">{sortedStudents.length}</div>
                  <div className="text-xs text-gray-500">Responses</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {(sortedStudents.reduce((acc, s) => acc + (s.score || 0), 0) / (sortedStudents.filter(s => s.score !== null).length || 1)).toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Avg Score</div>
                </div>
             </div>
           </div>
        </div>

        {/* Right Column: Responses */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-end">
            <h2 className="text-xl font-bold text-gray-900">Student Responses ({sortedStudents.length})</h2>
            {gameState.projectorDisplay.type === 'answer' && (
              <span className="text-sm text-green-600 flex items-center bg-green-50 px-3 py-1 rounded-full border border-green-200">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Projecting an Answer
              </span>
            )}
          </div>

          <div className="space-y-4">
            {sortedStudents.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400 border border-dashed border-gray-300">
                <p>Waiting for students to submit answers...</p>
              </div>
            ) : (
              sortedStudents.map((student) => (
                <StudentResponseCard 
                  key={student.id} 
                  student={student}
                  maxScore={gameState.maxScore}
                  isProjected={gameState.projectorDisplay.contentId === student.id}
                  grading={!!grading[student.id]}
                  onProject={() => backend.setProjectorView('answer', student.id)}
                  onAiGrade={() => handleAiGrade(student.id, student.text)}
                  onScore={(score) => backend.updateStudentScore(student.id, score)}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const StudentResponseCard: React.FC<{
  student: StudentResponse;
  maxScore: number;
  isProjected: boolean;
  grading: boolean;
  onProject: () => void;
  onAiGrade: () => void;
  onScore: (n: number) => void;
}> = ({ student, maxScore, isProjected, grading, onProject, onAiGrade, onScore }) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-all ${isProjected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-200'}`}>
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
              {student.studentName.charAt(0).toUpperCase()}
            </div>
            <h3 className="font-medium text-gray-900">{student.studentName}</h3>
            {student.score !== null && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                student.score === maxScore ? 'bg-green-100 text-green-800' :
                student.score > 0 ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {student.score} / {maxScore}
              </span>
            )}
          </div>
          <div className="flex gap-1">
             <button 
                onClick={onProject}
                title="Show on Projector"
                className={`p-2 rounded-lg transition-colors ${isProjected ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
               </svg>
             </button>
          </div>
        </div>

        <p className="text-gray-800 text-lg mb-4">{student.text}</p>

        {student.aiFeedback && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100 text-sm">
            <div className="flex items-center gap-2 mb-1 text-purple-700 font-medium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z"/><path d="M12 6a1 1 0 0 0-1 1v4.59L7.71 14.88a1 1 0 0 0 1.41 1.41L13 12.41V7a1 1 0 0 0-1-1Z"/></svg>
              AI Suggestion: {student.aiSuggestedScore}/{maxScore}
            </div>
            <p className="text-purple-800">{student.aiFeedback}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between border-t border-gray-100 pt-3 mt-2 gap-2">
           <div className="flex items-center gap-2 flex-wrap">
             <span className="text-xs text-gray-500 font-medium uppercase mr-2">Grade:</span>
             {Array.from({ length: maxScore + 1 }, (_, i) => i).map(score => (
               <button
                 key={score}
                 onClick={() => onScore(score)}
                 className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                   student.score === score 
                   ? 'bg-indigo-600 text-white shadow-md transform scale-105' 
                   : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                 }`}
               >
                 {score}
               </button>
             ))}
           </div>
           
           <Button 
            variant="ghost" 
            size="sm" 
            onClick={onAiGrade} 
            isLoading={grading}
            className="text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 ml-auto"
           >
             <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             {student.aiFeedback ? 'Re-Analyze' : 'AI Rate'}
           </Button>
        </div>
      </div>
    </div>
  );
};
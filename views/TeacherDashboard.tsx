import React, { useState, useEffect } from 'react';
import { backend, ConnectionStatus } from '../services/mockBackend';
import { GameState, StudentResponse, LogEntry } from '../types';
import { Button } from '../components/Button';
import { evaluateAnswer } from '../services/geminiService';
import { ProjectorView } from './ProjectorView';

export const TeacherDashboard: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(backend.getState());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(backend.connectionStatus);
  const [newPrompt, setNewPrompt] = useState('');
  const [newMaxScore, setNewMaxScore] = useState(2);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || process.env.API_KEY || '');
  const [grading, setGrading] = useState<Record<string, boolean>>({}); 
  const [internalProjectorOpen, setInternalProjectorOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    // Start hosting logic
    if (!backend.getState().roomCode) {
      backend.startHosting().then(() => {
          setConnectionStatus(backend.connectionStatus);
      }).catch(console.error);
    } else {
        if (backend.connectionStatus === 'disconnected') {
             backend.startHosting().then(() => setConnectionStatus(backend.connectionStatus));
        }
    }
    
    // Subscribe to state
    const unsubscribe = backend.subscribe(setGameState);
    // Subscribe to logs
    const unsubscribeLogs = backend.subscribeLogs(setLogs);

    // Poll status for UI sync
    const interval = setInterval(() => {
        setConnectionStatus(backend.connectionStatus);
    }, 2000);

    return () => {
        clearInterval(interval);
        unsubscribe();
        unsubscribeLogs();
    };
  }, []); 

  // Wake Lock
  useEffect(() => {
    if ('wakeLock' in navigator) {
      let wakeLock: any = null;
      const requestWakeLock = async () => {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) { console.log('Wake Lock denied'); }
      };
      requestWakeLock();
      document.addEventListener('visibilitychange', () => {
        if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
      });
    }
  }, []);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  const handleLaunchProjectorPopup = () => {
    const width = 1024;
    const height = 768;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    // Use URL API to safely append hash
    const url = new URL(window.location.href);
    url.hash = 'projector';
    window.open(url.toString(), 'ProjectorView', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`);
  };

  const handleSetPrompt = () => {
    if (!newPrompt.trim()) return;
    const validMaxScore = Math.max(1, newMaxScore);
    backend.setPrompt(newPrompt, validMaxScore);
    setNewPrompt('');
  };

  const handleResetRound = () => {
      if (confirm("Reset Round: This will clear ALL student answers. Students will see a blank input box. Continue?")) {
          backend.resetRound();
      }
  };

  const handleNewClass = async () => {
      if (confirm("New Class: This will DISCONNECT all students and create a new room code. Continue?")) {
          setIsResetting(true);
          await backend.startNewClass();
          setIsResetting(false);
      }
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
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center bg-gray-900 text-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-xs text-gray-400 uppercase font-bold mr-2 tracking-wider">Class Code:</span>
                {gameState.roomCode && !isResetting ? (
                    <span className="text-xl font-mono font-bold tracking-widest text-green-400">{gameState.roomCode}</span>
                ) : (
                    <span className="text-sm text-gray-400 animate-pulse">Generating...</span>
                )}
                </div>
                {connectionStatus === 'error' && (
                    <button 
                      onClick={() => setShowLogs(true)}
                      className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200 animate-pulse hover:bg-red-200"
                    >
                        ⚠ Connection Error (Click for Logs)
                    </button>
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
              ?
            </Button>
            
            <div className="flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setInternalProjectorOpen(true)}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-l-lg hover:bg-gray-100 hover:text-indigo-700"
              >
                Projector
              </button>
              <button
                type="button"
                onClick={handleLaunchProjectorPopup}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-l-0 border-gray-200 rounded-r-lg hover:bg-gray-100 hover:text-indigo-700"
                title="Pop out"
              >
                ↗
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
           <div className="bg-white rounded-lg w-full max-w-2xl h-[500px] flex flex-col shadow-xl">
              <div className="flex justify-between items-center p-4 border-b">
                 <h3 className="font-bold">System Logs</h3>
                 <button onClick={() => setShowLogs(false)}>✕</button>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-gray-100 font-mono text-xs">
                 {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-600' : 'text-gray-700'}`}>
                       <span className="opacity-50">[{log.timestamp}]</span> {log.message}
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Teacher Guide</h2>
            <div className="space-y-4 text-gray-600 overflow-y-auto max-h-[60vh]">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="font-bold text-indigo-700 mb-2">Connecting Students</h3>
                <p className="text-sm">This app uses Peer-to-Peer technology to keep it free.</p>
                <ul className="list-disc ml-5 text-sm mt-2">
                   <li>If students cannot join, click <strong>"New Class"</strong> to reset the server.</li>
                   <li>Connecting across Cellular (4G/5G) and WiFi works, but sometimes school firewalls block it.</li>
                   <li>Check the logs if issues persist.</li>
                </ul>
              </div>
              <div className="mt-4 pt-4 border-t">
                 <Button variant="secondary" onClick={() => setShowLogs(true)} className="w-full">Show Debug Logs</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Controls</h2>
            
            <div className="space-y-4">
               {/* Prompt Input */}
               <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">New Prompt</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 min-h-[80px] p-2 text-sm border"
                    placeholder="Type question here..."
                  />
                  <div className="flex gap-2 mt-2">
                     <input 
                        type="number" 
                        min="1" 
                        max="20"
                        value={newMaxScore}
                        onChange={(e) => setNewMaxScore(parseInt(e.target.value) || 2)}
                        className="w-16 border rounded p-1 text-center text-sm"
                        title="Max Score"
                     />
                     <Button onClick={handleSetPrompt} disabled={!newPrompt.trim()} size="sm" className="flex-1">
                        Post Prompt
                     </Button>
                  </div>
               </div>
               
               <hr className="border-gray-100" />
               
               <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase">Session Management</h3>
                  
                  {/* Distinct Reset Buttons */}
                  <Button 
                    variant="secondary" 
                    onClick={handleResetRound} 
                    className="w-full justify-center text-sm border-orange-200 text-orange-800 bg-orange-50 hover:bg-orange-100"
                  >
                     Reset Round (Clear Answers)
                  </Button>
                  
                  <Button 
                    variant="danger" 
                    onClick={handleNewClass} 
                    disabled={isResetting} 
                    className="w-full justify-center text-sm"
                  >
                     New Class (New Code)
                  </Button>
               </div>
               
               <div className="pt-2">
                  <Button variant="ghost" onClick={() => backend.addDemoStudents()} className="w-full text-xs text-indigo-400">
                    + Add Demo Students
                  </Button>
               </div>
               
               <div className="pt-2 text-center">
                  <button onClick={() => setShowLogs(true)} className="text-xs text-gray-400 underline">System Logs</button>
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
            <div>
                 <h2 className="text-xl font-bold text-gray-900">Student Responses ({sortedStudents.length})</h2>
                 <p className="text-sm text-gray-500 mt-1">Prompt: {gameState.prompt || "(None)"}</p>
            </div>
            {gameState.projectorDisplay.type === 'answer' && (
              <span className="text-sm text-green-600 flex items-center bg-green-50 px-3 py-1 rounded-full border border-green-200">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Projecting
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
              <span>AI Suggestion: {student.aiSuggestedScore}/{maxScore}</span>
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
             {student.aiFeedback ? 'Re-Analyze' : 'AI Rate'}
           </Button>
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { backend } from '../services/mockBackend';
import { GameState } from '../types';

interface ProjectorViewProps {
  onClose?: () => void;
}

export const ProjectorView: React.FC<ProjectorViewProps> = ({ onClose }) => {
  const [gameState, setGameState] = useState<GameState>(backend.getState());

  useEffect(() => {
    return backend.subscribe(setGameState);
  }, []);

  const displayType = gameState.projectorDisplay.type;
  const contentId = gameState.projectorDisplay.contentId;
  const studentAnswer = contentId ? gameState.students[contentId] : null;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden fixed inset-0 z-50">
      {/* Top Bar showing connection status/Brand */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-4 opacity-70">
           <span className="text-xl font-bold tracking-widest text-indigo-400">OWN WORDS WIZ</span>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm uppercase tracking-wide text-white">Live Projection</span>
           </div>
        </div>
        
        {onClose && (
          <button 
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Exit Projector Mode
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-12 lg:p-24 relative">
        {displayType === 'prompt' && (
          <div className="max-w-6xl w-full text-center">
            {gameState.prompt ? (
               <div className="animate-fade-in-up">
                 <h2 className="text-3xl text-gray-400 mb-8 font-light uppercase tracking-widest">Question</h2>
                 <p className="text-5xl md:text-7xl font-bold leading-tight text-white drop-shadow-2xl">
                   {gameState.prompt}
                 </p>
               </div>
            ) : (
              <div className="text-gray-500 text-4xl font-light">
                Ready to start...
              </div>
            )}
          </div>
        )}

        {displayType === 'answer' && studentAnswer && (
          <div className="max-w-5xl w-full bg-white text-gray-900 rounded-3xl p-16 shadow-2xl animate-scale-in">
             <div className="flex justify-between items-center mb-8 border-b-2 border-gray-100 pb-6">
                <h2 className="text-3xl text-indigo-600 font-bold">Student Response</h2>
                <div className="px-6 py-2 bg-gray-100 rounded-full text-xl font-medium text-gray-600">
                  Anonymous Review
                </div>
             </div>
             <p className="text-5xl md:text-6xl font-medium leading-normal mb-12">
               "{studentAnswer.text}"
             </p>
             <div className="flex justify-center">
                <div className="text-gray-400 text-xl">Discuss: Is this in their own words?</div>
             </div>
          </div>
        )}
      </div>

      {/* Bottom info ticker */}
      <div className="p-6 text-center text-gray-600">
        {Object.keys(gameState.students).length} Responses Submitted
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { TeacherDashboard } from './views/TeacherDashboard';
import { StudentView } from './views/StudentView';
import { ProjectorView } from './views/ProjectorView';
import { Role } from './types';

function App() {
  const [role, setRole] = useState<Role>(() => {
    // Check hash immediately during initialization to prevent routing flash
    const hash = window.location.hash;
    // Normalize hash: accept #projector, #/projector, etc.
    if (hash.replace(/^#\/?/, '') === 'projector') {
      return 'projector';
    }
    return null;
  });

  useEffect(() => {
    const checkHash = () => {
      // Robust hash checking
      const hash = window.location.hash;
      if (hash.replace(/^#\/?/, '') === 'projector') {
        setRole('projector');
      }
    };

    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  if (role === 'teacher') return <TeacherDashboard />;
  if (role === 'student') return <StudentView />;
  if (role === 'projector') return <ProjectorView />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full grid md:grid-cols-2 overflow-hidden">
        
        <div className="p-12 flex flex-col justify-center items-start text-left">
          <div className="mb-8">
            <span className="inline-block p-3 bg-indigo-100 rounded-xl mb-4 text-indigo-600">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </span>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Own Words Wiz</h1>
            <p className="text-gray-500 text-lg">National 5 English Lesson Review Tool.</p>
          </div>
          
          <div className="space-y-4 w-full">
            <button 
              onClick={() => setRole('teacher')}
              className="w-full text-left p-4 rounded-xl border-2 border-transparent hover:border-indigo-100 hover:bg-indigo-50 group transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-indigo-600">Teacher Mode</h3>
                  <p className="text-sm text-gray-500">Host session, project prompts, grade answers.</p>
                </div>
                <svg className="w-6 h-6 text-gray-300 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>

            <button 
              onClick={() => setRole('student')}
              className="w-full text-left p-4 rounded-xl border-2 border-transparent hover:border-purple-100 hover:bg-purple-50 group transition-all"
            >
               <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-purple-600">Student Mode</h3>
                  <p className="text-sm text-gray-500">Student Mode</p>
                </div>
                <svg className="w-6 h-6 text-gray-300 group-hover:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-gray-50 p-12 hidden md:flex flex-col justify-center items-center text-center border-l border-gray-100">
           <img src="https://picsum.photos/400/300?grayscale" alt="Classroom" className="rounded-lg shadow-lg mb-6 opacity-80 mix-blend-multiply" />
           <p className="text-sm text-gray-400 font-medium">
             Pro Tip: Open "Teacher Mode" in this tab, and "Student Mode" in a new tab to test the interaction! (Note: Incognito mode won't work as it isolates storage).
           </p>
        </div>

      </div>
    </div>
  );
}

export default App;
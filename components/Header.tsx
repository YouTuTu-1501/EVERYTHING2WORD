
import React from 'react';
import { FileText, FileType2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="w-full bg-[#1E3A8A] border-b border-blue-900 py-4 px-6 shadow-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">AI Doc to Word</h1>
            <p className="text-xs text-blue-100 font-medium opacity-80">Word output + LaTeX Math</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-blue-50 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
          <FileType2 className="w-4 h-4 text-blue-300" />
          <span>Giữ công thức dạng LaTeX</span>
        </div>
      </div>
    </header>
  );
};
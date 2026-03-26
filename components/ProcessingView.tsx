
import React from 'react';
import { Loader2, CheckCircle2, FileText, XCircle, Clock, Ban } from 'lucide-react';

interface FileProgress {
  name: string;
  status: 'waiting' | 'processing' | 'complete' | 'error';
}

interface ProcessingViewProps {
  files: FileProgress[];
  isComplete: boolean;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ files, isComplete, onCancel }) => {
  const completeCount = files.filter(f => f.status === 'complete').length;
  const totalCount = files.length;

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center animate-fade-in">
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="relative">
           {isComplete ? (
             <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-scale-up">
               <CheckCircle2 className="w-10 h-10 text-green-600" />
             </div>
           ) : (
             <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
               <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
             </div>
           )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-800">
            {isComplete ? 'Chuyển đổi hoàn tất!' : `Đang xử lý ${totalCount} tài liệu...`}
          </h3>
          {!isComplete && (
            <div className="w-full bg-gray-100 h-2 rounded-full max-w-xs mx-auto overflow-hidden">
               <div 
                className="bg-blue-600 h-full transition-all duration-500" 
                style={{ width: `${(completeCount / totalCount) * 100}%` }}
               />
            </div>
          )}
          <p className="text-gray-500 max-w-md mx-auto text-sm">
            {isComplete 
              ? 'Tất cả tài liệu đã sẵn sàng.' 
              : `Hoàn thành: ${completeCount}/${totalCount}. AI đang phân tích song song các tệp.`}
          </p>
        </div>

        <div className="w-full max-w-md space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm flex-shrink-0">
                  <FileText className={`w-4 h-4 ${file.status === 'error' ? 'text-red-500' : 'text-blue-500'}`} />
                </div>
                <p className="text-xs font-medium text-gray-700 truncate text-left">{file.name}</p>
              </div>
              <div className="flex-shrink-0">
                {file.status === 'processing' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                {file.status === 'complete' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {file.status === 'waiting' && <Clock className="w-4 h-4 text-gray-300" />}
                {file.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
            </div>
          ))}
        </div>

        {!isComplete && onCancel && (
          <button 
            onClick={onCancel}
            className="mt-4 px-6 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 hover:border-red-300 hover:shadow-sm transition-all flex items-center gap-2 mx-auto group"
          >
            <Ban className="w-4 h-4 group-hover:scale-110 transition-transform" />
            DỪNG VÀ HỦY XỬ LÝ
          </button>
        )}
      </div>
    </div>
  );
};

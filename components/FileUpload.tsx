
import React, { useRef, useState } from 'react';
import { UploadCloud, FileType, AlertCircle, ClipboardPaste } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (files: FileList) => void;
  disabled: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/plain', // .txt
    'application/rtf', // .rtf
    'text/rtf', // .rtf alternative
    'image/png',
    'image/jpeg'
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
  };

  const validateAndProcessFiles = (files: FileList) => {
    setError(null);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isAllowedExtension = ['pdf', 'docx', 'txt', 'rtf', 'png', 'jpg', 'jpeg'].includes(extension || '');

      if (!allowedTypes.includes(file.type) && !isAllowedExtension) {
        setError(`Tệp "${file.name}" không đúng định dạng. Hỗ trợ PDF, DOCX, TXT, RTF hoặc Hình ảnh.`);
        return;
      }
      
      if (file.size > 15 * 1024 * 1024) {
        setError(`Tệp "${file.name}" quá lớn (Tối đa 15MB).`);
        return;
      }
    }
    
    onFileSelect(files);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : ''}
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 bg-white shadow-sm'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.rtf,image/*"
          multiple
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />
        
        <div className="flex flex-col items-center justify-center gap-4">
          <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <UploadCloud className={`w-10 h-10 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-700">
              {isDragging ? 'Thả các tệp vào đây' : 'Tải lên hoặc kéo thả nhiều tệp'}
            </h3>
            <p className="text-sm text-gray-500">Hỗ trợ PDF, DOCX, RTF hoặc <b>Dán nhiều ảnh (Ctrl+V)</b></p>
          </div>
          
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                <ClipboardPaste className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Bulk Paste Support</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <FileType className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Parallel AI Processing</span>
              </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
    </div>
  );
};

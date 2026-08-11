
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

  const handleClipboardPaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        for (const item of items) {
          const imgType = item.types.find(t => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            files.push(new File([blob], `pasted-${Date.now()}.png`, { type: imgType }));
          }
        }
        if (files.length > 0) {
          const dt = new DataTransfer();
          files.forEach(f => dt.items.add(f));
          validateAndProcessFiles(dt.files);
          return;
        }
      }
      alert("Hãy nhấn tổ hợp phím Ctrl+V (hoặc Cmd+V) trên bàn phím để dán ảnh trực tiếp.");
    } catch {
      alert("Hãy nhấn tổ hợp phím Ctrl+V (hoặc Cmd+V) trên bàn phím để dán ảnh trực tiếp.");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300
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
            <p className="text-sm text-gray-500">
              Hỗ trợ PDF, DOCX, RTF hoặc <b className="text-blue-600">Dán liên tiếp nhiều ảnh (Ctrl+V)</b>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleClipboardPaste}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 transition-all shadow-sm active:scale-95 text-xs font-bold"
              >
                <ClipboardPaste className="w-4 h-4 text-blue-600" />
                <span>Dán từ Clipboard (Ctrl+V)</span>
              </button>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500">
                <FileType className="w-4 h-4 text-gray-400" />
                <span className="uppercase tracking-wide text-[10px] font-bold">Song song nhiều tệp</span>
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

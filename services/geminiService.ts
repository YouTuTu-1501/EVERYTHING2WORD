
import { GoogleGenAI } from "@google/genai";
import { FileData, CroppedImage, SimilarityLevel, MathFormat, DocumentType } from "../types";

// Declare Mammoth globally as it's loaded via script tag
declare const mammoth: any;

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const base64ToString = (base64: string): string => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

/**
 * Main conversion service
 */
export const convertDocument = async (
  fileData: FileData, 
  croppedImages: CroppedImage[] = [],
  includeSolutions: boolean = false,
  generateSimilar: boolean = false,
  similarCount: number = 1,
  similarityLevel: SimilarityLevel = 'numbers',
  mathFormat: MathFormat = 'equation',
  docType: DocumentType = 'academic'
): Promise<string> => {
  try {
    const modelId = "gemini-3-flash-preview";
    const base64Content = fileData.base64.split(',')[1] || fileData.base64;

    let parts: any[] = [];
    let processingInstruction = "";

    // Gửi tài liệu gốc trước
    if (fileData.type === "application/pdf") {
      parts.push({ inlineData: { mimeType: "application/pdf", data: base64Content } });
      processingInstruction = "Đây là tài liệu gốc (PDF).";
    } else if (fileData.type.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: fileData.type, data: base64Content } });
      processingInstruction = "Đây là hình ảnh gốc.";
    } else if (fileData.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const arrayBuffer = base64ToArrayBuffer(base64Content);
      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
      parts.push({ text: result.value });
      processingInstruction = "Đây là mã HTML từ DOCX gốc.";
    } else {
      parts.push({ text: base64ToString(base64Content) });
      processingInstruction = "Đây là văn bản gốc.";
    }

    // Gửi các ảnh cắt kèm metadata
    if (croppedImages.length > 0) {
        croppedImages.forEach((img) => {
             parts.push({ 
               inlineData: { 
                 mimeType: "image/png", 
                 data: img.base64.split(',')[1] 
               } 
             });
        });
        processingInstruction += ` Kèm theo ${croppedImages.length} ảnh cắt chi tiết (như hình vẽ, biểu đồ) được trích xuất từ tài liệu này.`;
    }

    const mathInstructions = mathFormat === 'latex' 
      ? `Sử dụng định dạng LaTeX trong dấu $. 
         QUY TẮC QUAN TRỌNG CHO MÃ LỚP/ĐỊNH DANH (VD: 7A, 7B, 10C): 
         - Phải gõ theo định dạng: $\{7A\}$, $\{7B\}$, $\{10C\}$.
         - Nếu có danh sách (7A, 7B), phải gõ tách biệt: $\{7A\}$, $\{7B\}$.
         - Tuyệt đối KHÔNG gõ dấu phẩy bên trong dấu ngoặc nhọn (Ví dụ SAI: $\{7A, 7B\}$).
         - Với điểm/mặt phẳng đơn lẻ: $\{A\}$, $\{B\}$, $(ABC)$.`
      : `Sử dụng định dạng MathML (<math>...</math>) hoặc công thức Word Equation chuẩn cho mọi công thức. Tuyệt đối không dùng LaTeX.`;

    const solutionPrompt = includeSolutions ? `
      NHIỆM VỤ GIẢI TOÁN: Giải chi tiết từng câu hỏi ngay sau đề bài gốc. Sử dụng thẻ <div style="background-color: #f0f7ff; padding: 12px; margin: 8px 0; border-left: 4px solid #3b82f6;">.
    ` : "";

    const similarPrompt = generateSimilar ? `
      NHIỆM VỤ BÀI TẬP TƯƠNG TỰ: Đối với MỖI câu hỏi hoặc bài tập tìm thấy trong tài liệu gốc, hãy tạo thêm ${similarCount} bài tập tương tự (${similarityLevel === 'numbers' ? 'chỉ đổi số liệu nhưng giữ nguyên cấu trúc' : 'đổi dạng bài tập cùng mức độ kiến thức'}). 
      Trình bày bài tập tương tự ngay sau lời giải (nếu có) hoặc ngay sau câu hỏi gốc của nó. 
      Đặt các bài tương tự trong <div style="border: 1px dashed #cbd5e1; padding: 12px; margin: 8px 0; background-color: #fafafa;"> và đánh dấu rõ là "Bài tập tương tự".
    ` : "";

    let prompt = "";

    if (docType === 'administrative') {
      prompt = `
        Bạn là chuyên gia số hóa và chuyển đổi VĂN BẢN HÀNH CHÍNH (Công văn, Quyết định, Thông tư, Nghị định, Hợp đồng, Tờ trình, Báo cáo, Quy chế...).

        YÊU CẦU VỀ NỘI DUNG VÀ THỂ THỨC:
        1. GIỮ NGUYÊN TOÀN BỘ NỘI DUNG: Không tóm tắt, không cắt xén, chuyển đổi trung thực 100% từng từ, từng dòng từ tài liệu gốc.
        2. TRÌNH BÀY CHUẨN THỂ THỨC VĂN BẢN HÀNH CHÍNH VIỆT NAM:
           - Quốc hiệu ("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), Tiêu ngữ ("Độc lập - Tự do - Hạnh phúc").
           - Tên cơ quan, tổ chức ban hành, Số/Ký hiệu văn bản, Địa danh & Ngày tháng năm.
           - Tên loại văn bản và Trích yếu nội dung (Căn giữa, in hoa, in đậm phù hợp).
           - Căn cứ pháp lý, căn cứ ban hành (in nghiêng, ngắt dòng chuẩn).
           - Cấu trúc Điều, Khoản, Điểm (Điều 1., 1., a)...) giữ chuẩn thụt lề, in đậm nhãn tiêu đề.
           - Phần Nơi nhận (thụt lề trái, cỡ chữ nhỏ/in nghiêng) và Chức vụ/Chữ ký người ký (ở phía bên phải).
        3. BẢNG BIỂU: Tái tạo bằng <table> HTML sạch, kẻ viền đầy đủ, chuẩn cấu trúc cột và hàng.
        4. KHÔNG tự ý chèn các ký hiệu toán học hay công thức toán học không có trong bản gốc.

        YÊU CẦU VỀ HÌNH ẢNH (NẾU CÓ):
        ${croppedImages.length > 0 ? `Chèn các thẻ [[IMAGE_1]], [[IMAGE_2]]... vào đúng vị trí tương ứng trong văn bản.` : 'Không có ảnh cắt.'}

        OUTPUT: Trả về duy nhất mã HTML nằm trong <body>. Không dùng markdown code blocks (\`\`\`html).
      `;
    } else {
      prompt = `
        Bạn là chuyên gia chuyển đổi tài liệu học thuật.
        
        YÊU CẦU VỀ NỘI DUNG:
        1. GIỮ NGUYÊN TOÀN BỘ nội dung của tài liệu gốc.
        2. KHÔNG được cắt xén, tóm tắt hay bỏ sót bất kỳ câu hỏi, đề bài hay lời giải nào có sẵn trong tài liệu.
        3. Chuyển đổi trung thực 100% văn bản từ tài liệu sang định dạng HTML.

        YÊU CẦU QUAN TRỌNG VỀ VỊ TRÍ HÌNH ẢNH:
        1. Bạn đã nhận được một tài liệu gốc và ${croppedImages.length} ảnh cắt nhỏ.
        2. Các ảnh cắt nhỏ này nằm ĐÂU ĐÓ trong văn bản gốc. Hãy nhìn vào nội dung ảnh cắt và tìm đoạn văn tương ứng trong tài liệu gốc.
        3. Chèn thẻ [[IMAGE_X]] (với X là số thứ tự ảnh 1, 2, 3...) vào CHÍNH XÁC vị trí mà ảnh đó xuất hiện so với văn bản xung quanh. 
        4. KHÔNG liệt kê tất cả ảnh ở cuối tài liệu. Phải đặt chúng xen kẽ vào đúng ngữ cảnh.

        ĐỊNH DẠNG TOÁN HỌC:
        ${mathInstructions}

        ${solutionPrompt}
        ${similarPrompt}

        BẢNG BIỂU: Tái tạo bằng <table> sạch.
        HÌNH ẢNH: Chèn thẻ [[IMAGE_X]] vào vị trí logic.
        OUTPUT: Trả về HTML bên trong <body>. Không dùng markdown code blocks.
      `;
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts: parts }
    });

    let text = response.text || "";
    let cleanHtml = text.replace(/```html/g, '').replace(/```/g, '').trim();

    // LaTeX Post-processing
    if (mathFormat === 'latex') {
      cleanHtml = cleanHtml.replace(/\$([^\$]+)\$/g, (match, p1) => {
          const content = p1.trim();
          if (!content || content.startsWith('{')) return match;
          
          if (/^[A-Za-z0-9\s,;.]+$/.test(content) && content.length < 25) {
              return content.split(/([,;])\s*/).map(part => {
                  if (part === ',' || part === ';') return `${part} `;
                  const trimmed = part.trim();
                  if (!trimmed) return '';
                  return `$\{${trimmed}\}$`;
              }).join('').trim();
          }
          return match;
      });

      cleanHtml = cleanHtml.replace(/\$([0-9,;.\s]+)\$/g, (m, p1) => {
          const t = p1.trim();
          if (!t || t.startsWith('{') || !/[0-9]/.test(t)) return m;
          return `$\{${t}\}$`;
      });
      cleanHtml = cleanHtml.replace(/\$([A-Za-z.,\s]+)\$/g, (m, p1) => {
          const t = p1.trim();
          if (!t || t.startsWith('{') || !/[A-Za-z]/.test(t) || /^[.,\s]+$/.test(t)) return m;
          return `$\{${t}\}$`;
      });
    }

    if (croppedImages.length > 0) {
        croppedImages.forEach((img, index) => {
            const placeholder = `[[IMAGE_${index + 1}]]`;
            const imgTag = `<div style="text-align:center; margin: 15px 0;"><img src="${img.base64}" style="max-width:100%; border: 1px solid #eee;" alt="Inserted Image ${index + 1}" /></div>`;
            const regex = new RegExp(`\\[\\[IMAGE_${index + 1}\\]\\]`, 'g');
            cleanHtml = cleanHtml.replace(regex, imgTag);
        });
    }
    
    return cleanHtml;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Lỗi khi kết nối với AI. Vui lòng thử lại.");
  }
};

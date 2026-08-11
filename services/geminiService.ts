
import { GoogleGenAI } from "@google/genai";
import { FileData, CroppedImage, SimilarityLevel, MathFormat, DocumentType } from "../types";
import { stripCssAndMetadata } from "../utils/htmlCleaner";

// Declare Mammoth globally as it's loaded via script tag
declare const mammoth: any;

// Initialize Gemini client with proper API key fallback and header
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
const ai = new GoogleGenAI({ 
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
  docType: DocumentType = 'academic',
  ignorePageNumbers: boolean = true
): Promise<string> => {
  try {
    const modelId = "gemini-3.6-flash";
    const base64Content = fileData.base64.split(',')[1] || fileData.base64;

    let parts: any[] = [];
    let processingInstruction = "";

    const isPdf = fileData.type === "application/pdf" || fileData.name.toLowerCase().endsWith(".pdf");
    const isImage = fileData.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileData.name);
    const isDocx = fileData.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileData.name.toLowerCase().endsWith(".docx");

    // Gửi tài liệu gốc trước
    if (isPdf) {
      parts.push({ inlineData: { mimeType: "application/pdf", data: base64Content } });
      processingInstruction = "Đây là tài liệu gốc (PDF).";
    } else if (isImage) {
      const mime = fileData.type.startsWith("image/") ? fileData.type : "image/jpeg";
      parts.push({ inlineData: { mimeType: mime, data: base64Content } });
      processingInstruction = "Đây là hình ảnh gốc.";
    } else if (isDocx) {
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

    const pageNumberPrompt = ignorePageNumbers ? `
      QUY TẮC NHẬN BIẾT VÀ BỎ QUA SỐ TRANG (PAGE NUMBERS / HEADER / FOOTER):
      - Tự động nhận diện và BỎ QUA TẤT CẢ các thông tin đánh số trang, chỉ số trang in ở lề trên/lề dưới/góc trang tài liệu hoặc ảnh (ví dụ: "Trang 1", "Trang 1/5", "Page 2", "- 3 -", "Trang 12", "12/50", "― 4 ―", "P. 5", hoặc các con số chỉ số trang nằm đơn lẻ ở đầu hoặc cuối trang).
      - KHÔNG trích xuất hoặc ghi các số trang này vào nội dung HTML đầu ra để đảm bảo văn bản liền mạch khi gộp nhiều trang/file.
    ` : "";

    let prompt = "";

    const systemInstruction = docType === 'administrative'
      ? "Bạn là hệ thống số hóa văn bản hành chính (Công văn, Quyết định, Thông tư, Tờ trình, Báo cáo...). Nhiệm vụ của bạn là nhận diện thị giác OCR và định dạng lại tài liệu do người dùng cung cấp thành mã HTML chuẩn thể thức văn bản hành chính."
      : "Bạn là hệ thống chuyển đổi thị giác OCR và định dạng HTML hỗ trợ số hóa tài liệu học tập. Nhiệm vụ của bạn là đọc và tái tạo cấu trúc trình bày, bài tập, bảng biểu, công thức toán từ tệp do người dùng cung cấp thành mã HTML.";

    if (docType === 'administrative') {
      prompt = `
        Nhiệm vụ: Chuyển đổi tài liệu hành chính do người dùng cung cấp sang mã HTML.
        
        YÊU CẦU TRÌNH BÀY:
        1. Đọc và tái tạo đầy đủ thông tin tài liệu bao gồm tên cơ quan, số ký hiệu, trích yếu, các Điều, Khoản, Nơi nhận và người ký.
        2. Trình bày chuẩn thể thức văn bản hành chính Việt Nam:
           - Quốc hiệu ("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), Tiêu ngữ ("Độc lập - Tự do - Hạnh phúc").
           - Tên cơ quan ban hành, Số/Ký hiệu văn bản, Địa danh & Ngày tháng năm.
           - Căn cứ pháp lý, căn cứ ban hành (in nghiêng, ngắt dòng chuẩn).
           - Cấu trúc Điều, Khoản, Điểm (Điều 1., 1., a)...).
           - Phần Nơi nhận và Chức vụ/Chữ ký người ký.
        3. BẢNG BIỂU: Tái tạo bằng <table> HTML sạch, kẻ viền đầy đủ.
        
        ${pageNumberPrompt}
        ${croppedImages.length > 0 ? `Chèn các thẻ [[IMAGE_1]], [[IMAGE_2]]... vào vị trí tương ứng trong văn bản.` : ''}

        OUTPUT: Trả về duy nhất mã HTML nằm trong <body>. KHÔNG chèn thẻ <style>, KHÔNG viết các khối mã CSS (như .doc-container { ... }, .doc-p { ... }). Không dùng markdown code blocks (\`\`\`html).
      `;
    } else {
      prompt = `
        Nhiệm vụ: Chuyển đổi tài liệu học thuật do người dùng cung cấp sang mã HTML.
        
        YÊU CẦU NỘI DUNG:
        1. Đọc tất cả các câu hỏi, bài tập, đề bài, hình vẽ, bảng biểu <table> và công thức toán học.
        2. Tái tạo đầy đủ cấu trúc các câu hỏi, các lựa chọn A, B, C, D và lời giải có sẵn.
        
        ${pageNumberPrompt}

        YÊU CẦU QUAN TRỌNG VỀ VỊ TRÍ HÌNH ẢNH:
        ${croppedImages.length > 0 ? `Chèn thẻ [[IMAGE_X]] (với X là số thứ tự ảnh 1, 2, 3...) vào CHÍNH XÁC vị trí mà ảnh xuất hiện trong văn bản.` : 'Không có ảnh cắt kèm theo.'}

        ĐỊNH DẠNG TOÁN HỌC:
        ${mathInstructions}

        ${solutionPrompt}
        ${similarPrompt}

        BẢNG BIỂU: Tái tạo bằng <table> sạch.
        OUTPUT: Trả về duy nhất mã HTML bên trong <body>. KHÔNG chèn thẻ <style>, KHÔNG viết các khối mã CSS (.doc-container, .bold...). Không dùng markdown code blocks.
      `;
    }

    const runCall = async (pParts: any[], sysInst: string) => {
      return await ai.models.generateContent({
        model: modelId,
        contents: { parts: pParts },
        config: {
          systemInstruction: sysInst,
        }
      });
    };

    let response: any = null;
    let text = "";
    let finishReason = "";

    try {
      response = await runCall([...parts, { text: prompt }], systemInstruction);
      
      const candidate = response.candidates?.[0];
      finishReason = candidate?.finishReason || "";

      try {
        text = response.text || "";
      } catch (e) {
        text = "";
      }

      if (!text && candidate?.content?.parts) {
        text = candidate.content.parts.map((p: any) => p.text || "").join("");
      }
    } catch (e: any) {
      console.warn("First API call attempt error:", e);
    }

    let cleanHtml = stripCssAndMetadata(text);

    // Fallback if RECITATION or empty response
    if (!cleanHtml || finishReason === 'RECITATION' || finishReason === 'SAFETY') {
      console.warn(`Initial call resulted in empty text or finishReason: ${finishReason}. Executing OCR fallback...`);
      
      const fallbackSystemInstruction = "Bạn là công cụ số hóa OCR. Hãy xuất mã HTML hiển thị toàn bộ nội dung tài liệu người dùng đã tải lên. Tuyệt đối không viết mã CSS.";
      const fallbackPrompt = `Hãy đọc tệp '${fileData.name}' và chuyển đổi tất cả nội dung văn bản, bảng biểu, bài tập sang mã HTML <body>. Khôi phục đầy đủ cấu trúc văn bản mà không kèm mã CSS.`;

      try {
        const fallbackRes = await runCall([...parts, { text: fallbackPrompt }], fallbackSystemInstruction);
        const fbCandidate = fallbackRes.candidates?.[0];
        
        try {
          text = fallbackRes.text || "";
        } catch (e) {
          text = "";
        }

        if (!text && fbCandidate?.content?.parts) {
          text = fbCandidate.content.parts.map((p: any) => p.text || "").join("");
        }
        cleanHtml = stripCssAndMetadata(text);
      } catch (fbErr) {
        console.error("Fallback call error:", fbErr);
      }
    }

    if (!cleanHtml) {
      if (finishReason === 'RECITATION') {
        throw new Error("AI nhận diện tài liệu này thuộc văn bản xuất bản tiêu chuẩn (Trạng thái: RECITATION). Vui lòng thử chụp ảnh hoặc số hóa từng trang lẻ.");
      }
      throw new Error(`AI không thể trích xuất nội dung từ tệp này (Trạng thái: ${finishReason || 'Rỗng'}). Vui lòng thử lại hoặc kiểm tra định dạng tệp.`);
    }

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

    if (ignorePageNumbers) {
      // Post-processing to strip out remaining standalone page numbers like <p>Trang 1</p>, <p>Page 2/10</p>, <p>- 3 -</p>
      cleanHtml = cleanHtml.replace(/<(p|div)[^>]*>\s*(?:trang|page|p\.)?\s*[-–—―]?\s*\d+\s*(?:[\/\:]\s*\d+)?\s*[-–—―]?\s*<\/\1>/gi, '');
    }
    
    return cleanHtml;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    const rawMessage = error?.message || "";

    if (rawMessage.includes("429") || rawMessage.includes("RESOURCE_EXHAUSTED") || rawMessage.includes("quota")) {
      throw new Error("Lỗi giới hạn tần suất: Hệ thống AI đang quá tải, vui lòng thử lại sau giây lát.");
    }
    if (rawMessage.includes("API_KEY") || rawMessage.includes("UNAUTHENTICATED")) {
      throw new Error("Lỗi xác thực: Khóa AI API chưa được cấu hình hoặc không hợp lệ.");
    }
    if (rawMessage.includes("SAFETY") || rawMessage.includes("BLOCKED")) {
      throw new Error("Lỗi nội dung: Tệp bị chặn do vi phạm chính sách an toàn của AI.");
    }
    if (rawMessage.includes("MAX_TOKENS") || rawMessage.includes("too large")) {
      throw new Error("Tệp quá nặng: Dung lượng tệp quá lớn so with giới hạn xử lý của AI.");
    }

    throw new Error(rawMessage || "Lỗi khi kết nối với AI. Vui lòng thử lại.");
  }
};

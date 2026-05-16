import { GoogleGenAI } from "@google/genai";

export async function generateGeminiImage(apiKey: string, prompt: string, aspectRatio: string = "9:16", quality: string = "standard") {
  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3.1-flash-image-preview';
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: quality === "ultra" ? "4K" : "1K"
      }
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image with Gemini");
}

export async function generateGeminiVideo(apiKey: string, prompt: string, aspectRatio: string = "9:16") {
  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'veo-3.1-generate-preview';
  
  let operation = await ai.models.generateVideos({
    model: modelName,
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: aspectRatio as any
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed or timed out");

  const response = await fetch(downloadLink, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey,
    },
  });

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

import { GoogleGenAI, Type } from "@google/genai";

export const evaluateAnswer = async (
  apiKey: string,
  prompt: string,
  studentAnswer: string,
  maxScore: number = 2
): Promise<{ score: number; feedback: string }> => {
  if (!apiKey) {
    return { score: 0, feedback: "API Key missing. Cannot evaluate." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // We ask for a JSON response for structured data
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
        You are an expert English teacher grading "Own Words" questions for National 5 exams.
        
        Question Prompt: "${prompt}"
        Student Answer: "${studentAnswer}"
        Max Possible Score: ${maxScore}
        
        Task:
        1. Determine if the student answered the prompt correctly using their own words (paraphrasing).
        2. Assign a score: An integer between 0 and ${maxScore}.
           - 0: Incorrect, completely lifted, or irrelevant.
           - ${maxScore}: Excellent, clear, fully accurate, used own words.
           - Intermediate values: Partially correct or minor lifting.
        3. Provide brief, constructive feedback (max 15 words).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: `Score between 0 and ${maxScore}` },
            feedback: { type: Type.STRING, description: "Brief feedback for the teacher" },
          },
          required: ["score", "feedback"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      score: result.score ?? 0,
      feedback: result.feedback || "No feedback generated.",
    };

  } catch (error) {
    console.error("Gemini Error:", error);
    return { score: 0, feedback: "AI evaluation failed." };
  }
};
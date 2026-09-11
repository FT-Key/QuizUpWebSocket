export interface QuestionImage {
  url: string;
  thumb?: string;
  alt?: string;
  author?: string;
  authorLink?: string;
}

export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctAnswer: number; // 0..3
  image?: QuestionImage | null;
}

import type { Question, QuestionImage } from "../../core/domain/question.js";

export class QuestionBuilder {
  private question: Question = {
    id: "question-1",
    text: "¿Pregunta de prueba?",
    options: ["A", "B", "C", "D"],
    correctAnswer: 0,
    image: null,
  };

  withId(id: string): this {
    this.question.id = id;
    return this;
  }

  withText(text: string): this {
    this.question.text = text;
    return this;
  }

  withOptions(options: [string, string, string, string]): this {
    this.question.options = options;
    return this;
  }

  withCorrectAnswer(correctAnswer: number): this {
    this.question.correctAnswer = correctAnswer;
    return this;
  }

  withImage(image: QuestionImage | null): this {
    this.question.image = image;
    return this;
  }

  build(): Question {
    return {
      ...this.question,
      options: [...this.question.options] as [string, string, string, string],
      image: this.question.image ? { ...this.question.image } : this.question.image,
    };
  }
}

export interface MathQuestion {
  expression: string;
  answer: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMathQuestion(): MathQuestion {
  const operation = randomInt(0, 2);

  if (operation === 0) {
    const a = randomInt(100, 99_999);
    const b = randomInt(100, 99_999);

    return {
      expression: `${a} + ${b}`,
      answer: a + b,
    };
  }

  if (operation === 1) {
    const a = randomInt(1_000, 99_999);
    const b = randomInt(100, a);

    return {
      expression: `${a} − ${b}`,
      answer: a - b,
    };
  }

  const a = randomInt(12, 99);
  const b = randomInt(2, 20);

  return {
    expression: `${a} × ${b}`,
    answer: a * b,
  };
}

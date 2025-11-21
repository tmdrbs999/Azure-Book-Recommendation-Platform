// Centralized book data and helpers
const BOOKS = [
  { id: 1, title: 'Practical Statistics for Data Scientists', author: 'Peter Bruce', price: '25,000', description: '실무 데이터 분석에 필요한 통계 개념과 예제를 제공합니다.' },
  { id: 2, title: 'Deep Learning with Python', author: "François Chollet", price: '30,000', description: '케라스 창시자가 알려주는 딥러닝 실전 안내서입니다.' },
  { id: 3, title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', price: '35,000', description: '대규모 데이터 시스템 설계의 원칙과 패턴을 다룹니다.' },
  { id: 4, title: 'Clean Code', author: 'Robert C. Martin', price: '22,000', description: '좋은 코드와 소프트웨어 설계 습관을 배우는 고전입니다.' },
  { id: 5, title: "You Don't Know JS", author: 'Kyle Simpson', price: '18,000', description: '자바스크립트의 내부 동작을 깊게 이해하도록 돕습니다.' },

  // Python stack
  { id: 101, title: 'Python Crash Course', author: 'Eric Matthes', price: '27,000', description: '파이썬 기초부터 실전 예제까지.' },
  { id: 102, title: 'Fluent Python', author: 'Luciano Ramalho', price: '45,000', description: '파이썬 고급 기능과 관용적 코딩 기법.' },

  // React stack
  { id: 201, title: 'Learning React', author: 'Alex Banks', price: '28,000', description: '리액트 기본과 Hooks 실전.' },
  { id: 202, title: 'Fullstack React', author: 'Fullstack Team', price: '40,000', description: '리액트로 풀스택 앱 만들기.' },
  { id: 203, title: "You Don't Know JS", author: 'Kyle Simpson', price: '18,000', description: '자바스크립트 심화 이해.' },

  // Kafka / Data infra
  { id: 301, title: 'Kafka: The Definitive Guide', author: 'Neha Narkhede', price: '50,000', description: '카프카 아키텍처와 운영 가이드.' },
  { id: 302, title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', price: '35,000', description: '분산 데이터 시스템 설계 원칙.' },
];

const STACK_MAP = {
  Python: [101, 102, 1],
  React: [201, 202, 203, 5],
  Kafka: [301, 302, 3],
};

export function getBooks() { return BOOKS; }
export function getBookById(id) { return BOOKS.find(b => Number(b.id) === Number(id)); }
export function getBooksByStack(stackName) {
  const ids = STACK_MAP[stackName] || [];
  return ids.map(id => getBookById(id)).filter(Boolean);
}

export default { getBooks, getBookById, getBooksByStack };

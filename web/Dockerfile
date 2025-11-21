# Stage 1: 빌드 환경 (React 앱 빌드를 위해 Node.js 환경 사용)
FROM node:22-alpine AS build

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package.json .
COPY package-lock.json .

# 모든 의존성 설치 (React 빌드에 devDependencies 필요)
RUN npm install

# 나머지 소스 코드 복사
COPY . .

# React 앱 빌드 (build/ 폴더 생성)
RUN npm run build

# Stage 2: 실행 환경 (Express 서버 실행을 위해 경량 Node.js 환경 사용)
FROM node:22-alpine

# App Service 표준 포트 8080 노출
EXPOSE 8080

# 최종 실행에 필요한 파일만 복사
WORKDIR /home/site/wwwroot

# Express 서버 파일 및 React 빌드 결과 복사
COPY --from=build /app/build ./build
COPY --from=build /app/server.js .
COPY --from=build /app/package.json .

# node_modules 복사 (운영 환경 실행에 필수)
COPY --from=build /app/node_modules ./node_modules

# 실행 명령: Express 서버를 node로 직접 실행
CMD ["node", "server.js"]
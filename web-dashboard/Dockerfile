FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application
COPY app.js ./

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]

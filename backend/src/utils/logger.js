'use strict';

const { createLogger, format, transports } = require('winston');
const config = require('../config');

const logger = createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    config.env === 'production'
      ? format.json()
      : format.printf(({ timestamp, level, message, stack }) =>
          stack
            ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
            : `${timestamp} [${level.toUpperCase()}]: ${message}`
        )
  ),
  transports: [
    new transports.Console(),
    ...(config.env === 'production'
      ? [new transports.File({ filename: 'logs/error.log', level: 'error' }),
         new transports.File({ filename: 'logs/combined.log' })]
      : []),
  ],
});

module.exports = logger;

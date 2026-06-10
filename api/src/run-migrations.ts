/* eslint-disable no-console */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import AppDataSource from './data-source';

dotenv.config();

AppDataSource.initialize()
  .then(async () => {
    await AppDataSource.destroy();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

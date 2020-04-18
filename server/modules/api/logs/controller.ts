/* eslint-disable no-underscore-dangle */
import { NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { queryMetrics, queriesByUser } from './mongo';

interface LogController {
  findUser(req: Request, res: Response, next: NextFunction): any;
  addLog(req: Request, res: Response, next: NextFunction): any;
  displayLogs(req: Request, res: Response, next: NextFunction): any;
  displayLog(req: Request, res: Response, next: NextFunction): any;
  displayInstance(req: Request, res: Response, next: NextFunction): any;
  deleteLog(req: Request, res: Response, next: NextFunction): any;
  deleteInstance(req: Request, res: Response, next: NextFunction): any;
}

interface IndivQueryByUser {
  queryString: string;
  timeStamp: string;
  _id: any; // don't want to import mongodb for ObjectID
  counter: number;
}

interface Instance {
  queryString: string;
  timeStamp: string;
  outputMetrics: string;
}


const logController: LogController = {
  findUser(req: Request, res: Response, next: NextFunction) {
    const { username } = res.locals;

    if (!username) {
      return next({
        code: 400,
        message: 'Invalid params.',
        log: 'logs.findUser: Need username.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        return next({
          code: 400,
          message: 'Error with MongoDB',
          log: 'logs.findUser: Error with DB when searching for username.',
        });
      }

      if (!results) {
        // no user yet, add a new user document
        queriesByUser.create({ username }, (createErr: Error, createRes: any) => {
          if (createErr) {
            return next({
              code: 400,
              message: 'Error with MongoDB',
              log: 'logs.findUser: Error with DB when creating new user.',
            });
          }
        });
      }
      return next();
    });
  },

  addLog(req: Request, res: Response, next: NextFunction) {
    const { queryString, outputMetrics } = req.body;
    const { username } = res.locals;

    if (!username || !queryString || !outputMetrics) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.addLog: Did not receive all needed params.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        return next({
          code: 400,
          message: 'Error with MongoDB',
          log: 'logs.addLog: Error with DB when searching for queries by user',
        });
      }
      if (!results) {
      // some sort of error
        return next({
          code: 400,
          message: 'Error with user retrieval',
          log: 'logs.addLog: Error with DB when searching for user',
        });
      }

      if (results) {
        const { queryHistory } = results;
        // issue with default moment is that it is in UTC, need to adjust for EST
        const curTime = moment().subtract({ hours: 4 }).format('MMMM Do YYYY, h:mm:ss a');
        let bFound = false;

        if (queryHistory.length) {
          for (let i = 0; i < queryHistory.length; i += 1) {
            if (queryHistory[i].queryString === queryString) {
              // found the existing query, add to this
              queryHistory[i].queryIDs.push(uuidv4()); // add random uuid
              queryHistory[i].outputMetrics.push(outputMetrics);
              queryHistory[i].timeStamp.push(curTime);
              queryHistory[i].counter += 1;
              bFound = true;
              results.save();
            }
          }
        }
        if (!bFound) {
        // create new log
          queryHistory.push({ queryIDs: [uuidv4()], queryString, outputMetrics, timeStamp: [curTime] });
          results.save();
        }
      }
    });
    return next();
  },

  displayLogs(req: Request, res: Response, next: NextFunction) {
    const { username } = res.locals;

    if (!username) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.displayLogs: Did not receive username.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        // some sort of error
        return next({
          code: 400,
          message: 'Error with user retrieval',
          log: 'logs.displayLogs: Error with DB when searching for user',
        });
      }

      if (results) {
        // parsing data server-side for optimum bandwidth traffic
        const { queryHistory } = results;
        const output = [];
        for (let i = 0; i < queryHistory.length; i += 1) {
          const indivQuery: IndivQueryByUser = {
            queryString: queryHistory[i].queryString,
            timeStamp: queryHistory[i].timeStamp[queryHistory[i].counter],
            _id: queryHistory[i]._id,
            counter: queryHistory[i].counter + 1, // counter is 0-indexed
          };
          output.push(indivQuery);
        }
        res.locals.logs = output;
      } else res.locals.logs = 'No results found';
      // if no results, just move onto next middleware
      return next();
    });
  },

  displayLog(req: Request, res: Response, next: NextFunction) {
    const { username } = res.locals;
    const { queryID } = req.params;

    if (!username || !queryID) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.displayLog: Did not receive username or queryID.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        // some sort of error
        return next({
          code: 400,
          message: 'Error with user retrieval',
          log: 'logs.displayLog: Error with DB when searching for user',
        });
      }

      if (results) {
        const { queryHistory } = results;
        // only if there are queries
        if (queryHistory.length) {
          for (let i = 0; i < queryHistory.length; i += 1) {
            if (queryHistory[i]._id == queryID) res.locals.log = queryHistory[i];
          }
        } else res.locals.log = []; // no query history
      }
      return next();
    });
  },

  displayInstance(req: Request, res: Response, next: NextFunction) {
    const { username } = res.locals;
    const { queryID, instanceID } = req.params;

    if (!username || !queryID || !instanceID) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.displayInstance: Did not receive username or queryID.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        // some sort of error
        return next({
          code: 400,
          message: 'Error with user retrieval',
          log: 'logs.displayInstance: Error with DB when searching for user',
        });
      }

      if (results) {
        const { queryHistory } = results;
        // only if there are queries
        if (queryHistory.length) {
          for (let i = 0; i < queryHistory.length; i += 1) {
            if (queryHistory[i]._id == queryID) { // Mongo _id is not a string
              // found the specific query, now need to dig for instance ID
              for (let j = 0; j < queryHistory[i].queryIDs.length; j += 1) {
                if (queryHistory[i].queryIDs[j] === instanceID) {
                  // found the instance, give back the relevant info
                  const instance: Instance = {
                    queryString: queryHistory[i].queryString,
                    outputMetrics: queryHistory[i].outputMetrics[j],
                    timeStamp: queryHistory[i].timeStamp[j],
                  };
                  res.locals.instance = instance;
                }
              }
              if (!res.locals.instance) res.locals.instance = {}; // no instance found
            }
          }
        } else res.locals.instance = {}; // no specific query exists
      }
      return next();
    });
  },

  deleteLog(req: Request, res: Response, next: NextFunction) {
    const { instanceID } = req.params;

    if (!instanceID) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.displayInstance: Did not receive username or queryID.',
      });
    }

    queryMetrics.findByIdAndDelete(instanceID, (err: Error) => {
      if (err) {
        return next({
          code: 400,
          message: 'Error with query deletion',
          log: 'logs.findByIdAndDelete: Error with DB when searching for user',
        });
      }
      return next();
    });
  },

  deleteInstance(req: Request, res: Response, next: NextFunction) {
    const { username } = res.locals;
    const { queryID, instanceID } = req.params;

    if (!username || !queryID || !instanceID) {
      return next({
        code: 400,
        message: 'Invalid params',
        log: 'logs.deleteInstance: Did not receive username or queryID.',
      });
    }

    queriesByUser.findOne({ username }, (err: Error, results: any) => {
      if (err) {
        // some sort of error
        return next({
          code: 400,
          message: 'Error with user retrieval',
          log: 'logs.deleteInstance: Error with DB when searching for user',
        });
      }

      if (results) {
        const { queryHistory } = results;
        // only if there are queries
        if (queryHistory.length) {
          for (let i = 0; i < queryHistory.length; i += 1) {
            if (queryHistory[i]._id == queryID) { // Mongo _id is not a string
              // found the specific query, now need to dig for instance ID
              for (let j = 0; j < queryHistory[i].queryIDs.length; j += 1) {
                if (queryHistory[i].queryIDs[j] === instanceID) {
                  // found the instance, now need to wipe this instance
                  // front-end logic dictates this can only happen where there are >1 instances
                  queryHistory[i].outputMetrics.splice(j, 1);
                  queryHistory[i].timeStamp.splice(j, 1);
                  queryHistory[i].queryIDs.splice(j, 1);
                  queryHistory[i].counter -= 1;
                  results.update();
                }
              }
            }
          }
        }
      }
      return next();
    });
  },
};

export default logController;

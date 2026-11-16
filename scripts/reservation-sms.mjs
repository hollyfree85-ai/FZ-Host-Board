import {reconcileAllSms} from '../server/reservation-sms.mjs';
reconcileAllSms(process.env).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Reservation SMS reconciliation failed. Inspect provider and job status before retrying uncertain messages.');process.exitCode=1;});

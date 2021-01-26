/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import dns = require('dns');
import { promisify } from 'util';
import { env, toNumber, sleep, Duration } from '@salesforce/kit';
import { Logger, Org, Messages, SfdxError } from '@salesforce/core';
import { UX } from '@salesforce/command';
import openBrowser = require('opn');
import { asString, Optional } from '@salesforce/ts-types';
import { trimEnd } from 'lodash';

const lookup = promisify(dns.lookup);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-org', 'open');

import srcDevUtil = require('../core/srcDevUtil');

const SETUP = '/setup/forcecomHomepage.apexp';

const open = {
  logger: null as Logger,

  async buildFrontdoorUrl(org: Org): Promise<string> {
    await org.refreshAuth();
    const conn = org.getConnection();
    const accessToken = conn.accessToken;
    const instanceUrl = org.getField(Org.Fields.INSTANCE_URL);

    return `${trimEnd(asString(instanceUrl), '/')}/secur/frontdoor.jsp?sid=${accessToken}`;
  },

  /**
   * gets a url for the workspace or test org
   *
   * @param context - the cli context
   * @param force - the force api
   * @param orgApi - an org.
   * @returns {Promise}
   * @private
   */
  buildUrl: async (org: Org, path: Optional<string>, isSetup = false): Promise<string> => {
    const url = await open.buildFrontdoorUrl(org);

    if (!path) {
      if (isSetup) {
        path = SETUP;
      } else {
        // Could return undefined or emptry string.
        path = env.getString('FORCE_OPEN_URL');
      }
    }

    if (path) {
      const cleanPath = encodeURIComponent(decodeURIComponent(path));
      return `${url}&retURL=${cleanPath}`;
    }
    return url;
  },

  // Try for four minutes, by default
  getDomainRetries: () => toNumber(env.getString('SFDX_DOMAIN_RETRY', '240')),

  async checkDns(domain: string): Promise<string> {
    return (await lookup(domain)).address;
  },

  async delay() {
    return await sleep(1, Duration.Unit.SECONDS);
  },

  checkLightningDomain: async (myDomain: string, ux: UX, retryCount = 0): Promise<void> => {
    open.logger = open.logger || (await Logger.child('open'));
    const domain = `${myDomain}.lightning.force.com`;
    try {
      // Get around typings
      const ip = await open.checkDns(domain);
      open.logger.debug(`Found IP ${ip} for ${domain}`);
      if (retryCount > 0) {
        ux.stopSpinner();
      }
    } catch (err) {
      if (retryCount >= open.getDomainRetries()) {
        open.logger.debug(`Did not find IP for ${domain} after ${retryCount} retries`);
        ux.stopSpinner();
        throw err;
      } else {
        if (retryCount === 0) {
          // We didn't find the IP after the first try, so let the user know we are looking.
          ux.startSpinner(messages.getMessage('openCommandDomainWaiting'));
        }
        await open.delay();
        return open.checkLightningDomain(myDomain, ux, ++retryCount);
      }
    }
  },
  async openBrowserWithUrl(url) {
    await openBrowser(url, { wait: false });
  },
  /**
   * either open user's desktop browser or just print the url in console.
   *
   * @param context - the cli context
   * @param force - the force api
   * @returns {Promise}
   * @private
   */
  open: async (org: Org, ux: UX, path: Optional<string>, isSetup: Optional<boolean>, urlOnly: Optional<boolean>) => {
    const url = await open.buildUrl(org, path, isSetup);

    const orgId = org.getOrgId();
    const username = org.getUsername();
    const retVal = {
      url,
      orgId,
      username,
    };

    const act = async () => {
      if (!urlOnly && !srcDevUtil.isSFDXContainerMode()) {
        await open.openBrowserWithUrl(url);
      }
      return retVal;
    };

    // don't resolve domain if it is internal or retries = 0;
    if (open.getDomainRetries() === 0 || srcDevUtil.isInternalUrl(url)) {
      return act();
    }

    try {
      try {
        const myDomain = url.match(/https?\:\/\/([^.]*)/)[1];
        await open.checkLightningDomain(myDomain, ux);
        return act();
      } catch (err) {
        throw new SfdxError(messages.getMessage('openCommandDomainTimeoutError'), 'openCommandDomainTimeoutError', [
          messages.getMessage('openCommandDomainTimeoutAction'),
        ]);
      }
    } catch (err) {
      // Error extracting the mydomain, just return.
      return act();
    }
  },
};

export default open;

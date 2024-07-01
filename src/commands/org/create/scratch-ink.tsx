/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  Lifecycle,
  Messages,
  Org,
  scratchOrgCreate,
  ScratchOrgLifecycleEvent,
  scratchOrgLifecycleEventName,
  scratchOrgLifecycleStages,
  SfError,
} from '@salesforce/core';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Duration } from '@salesforce/kit';
import { Box, Instance, Text, render } from 'ink';
import { capitalCase } from 'change-case';
import React from 'react';
import { SpinnerOrError } from '../../../components/spinner.js';
import { buildScratchOrgRequest } from '../../../shared/scratchOrgRequest.js';
import { formatOrgId, formatRequest, formatUsername } from '../../../shared/scratchOrgOutput.js';
import { ScratchCreateResponse } from '../../../shared/orgTypes.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-org', 'create_scratch');

const definitionFileHelpGroupName = 'Definition File Override';

function Status(props: {
  readonly data?: ScratchOrgLifecycleEvent;
  readonly baseUrl: string;
  readonly error?: SfError | Error | undefined;
}): React.ReactNode {
  if (!props.data) return;

  return (
    <Box flexDirection="column">
      <Text bold>Creating Scratch Org</Text>
      <Box flexDirection="column" marginRight={2} padding={1}>
        {(props.data?.scratchOrgInfo?.Id && (
          <Text>Request Id: {formatRequest(props.baseUrl, props.data?.scratchOrgInfo?.Id)}</Text>
        )) ?? (
          <Box>
            <Text>Request Id: </Text>
            <SpinnerOrError error={props.error} type="simpleDotsScrolling" />
          </Box>
        )}

        {(props.data?.scratchOrgInfo?.ScratchOrg && (
          <Text>OrgId: {formatOrgId(props.data?.scratchOrgInfo?.ScratchOrg)}</Text>
        )) ?? (
          <Box>
            <Text>OrgId: </Text>
            <SpinnerOrError error={props.error} type="simpleDotsScrolling" />
          </Box>
        )}

        {(props.data?.scratchOrgInfo?.SignupUsername && (
          <Text>Username: {formatUsername(props.data?.scratchOrgInfo?.SignupUsername)}</Text>
        )) ?? (
          <Box>
            <Text>Username: </Text>
            <SpinnerOrError error={props.error} type="simpleDotsScrolling" />
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        {scratchOrgLifecycleStages.map((stage, stageIndex) => {
          // current stage
          if (props.data!.stage === stage && stage !== 'done')
            return (
              <Box key={stage}>
                <SpinnerOrError isBold error={props.error} type="arc" />
                <Text bold color="magenta">
                  {' '}
                  {capitalCase(stage)}
                </Text>
              </Box>
            );
          // completed stages
          if (scratchOrgLifecycleStages.indexOf(props.data!.stage) > stageIndex)
            return (
              <Text key={stage} bold color="green">
                ✓ {capitalCase(stage)}
              </Text>
            );

          // done stage
          if (props.data!.stage === stage && stage === 'done')
            return (
              <Text key={stage} bold color="blue">
                {capitalCase(stage)}
              </Text>
            );

          if (stage !== 'done') {
            // future stage
            return (
              <Text key={stage} color="dim">
                ◼ {capitalCase(stage)}
              </Text>
            );
          }
        })}
      </Box>
    </Box>
  );
}

export default class OrgCreateScratch extends SfCommand<ScratchCreateResponse> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly aliases = ['env:create:scratch'];
  public static readonly deprecateAliases = true;

  public static readonly flags = {
    alias: Flags.string({
      char: 'a',
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
    }),
    async: Flags.boolean({
      summary: messages.getMessage('flags.async.summary'),
      description: messages.getMessage('flags.async.description'),
    }),
    'set-default': Flags.boolean({
      char: 'd',
      summary: messages.getMessage('flags.set-default.summary'),
    }),
    'definition-file': Flags.file({
      exists: true,
      char: 'f',
      summary: messages.getMessage('flags.definition-file.summary'),
      description: messages.getMessage('flags.definition-file.description'),
    }),
    'target-dev-hub': Flags.requiredHub({
      char: 'v',
      summary: messages.getMessage('flags.target-dev-hub.summary'),
      description: messages.getMessage('flags.target-dev-hub.description'),
      required: true,
    }),
    'no-ancestors': Flags.boolean({
      char: 'c',
      summary: messages.getMessage('flags.no-ancestors.summary'),
      helpGroup: 'Packaging',
    }),
    edition: Flags.string({
      char: 'e',
      summary: messages.getMessage('flags.edition.summary'),
      description: messages.getMessage('flags.edition.description'),
      options: [
        'developer',
        'enterprise',
        'group',
        'professional',
        'partner-developer',
        'partner-enterprise',
        'partner-group',
        'partner-professional',
      ],
      // eslint-disable-next-line @typescript-eslint/require-await
      parse: async (value: string) => {
        // the API expects partner editions in `partner <EDITION>` format.
        // so we replace the hyphen here with a space.
        if (value.startsWith('partner-')) {
          return value.replace('-', ' ');
        }
        return value;
      },
      helpGroup: definitionFileHelpGroupName,
    }),
    'no-namespace': Flags.boolean({
      char: 'm',
      summary: messages.getMessage('flags.no-namespace.summary'),
      helpGroup: 'Packaging',
    }),
    'duration-days': Flags.duration({
      unit: 'days',
      default: Duration.days(7),
      min: 1,
      max: 30,
      char: 'y',
      helpValue: '<days>',
      summary: messages.getMessage('flags.duration-days.summary'),
    }),
    wait: Flags.duration({
      unit: 'minutes',
      default: Duration.minutes(5),
      min: 1,
      char: 'w',
      helpValue: '<minutes>',
      summary: messages.getMessage('flags.wait.summary'),
      description: messages.getMessage('flags.wait.description'),
    }),
    'api-version': Flags.orgApiVersion(),
    'client-id': Flags.string({
      char: 'i',
      summary: messages.getMessage('flags.client-id.summary'),
    }),
    'track-source': Flags.boolean({
      default: true,
      char: 't',
      summary: messages.getMessage('flags.track-source.summary'),
      description: messages.getMessage('flags.track-source.description'),
      allowNo: true,
    }),
    username: Flags.string({
      summary: messages.getMessage('flags.username.summary'),
      description: messages.getMessage('flags.username.description'),
      helpGroup: definitionFileHelpGroupName,
    }),
    description: Flags.string({
      summary: messages.getMessage('flags.description.summary'),
      helpGroup: definitionFileHelpGroupName,
    }),
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      helpGroup: definitionFileHelpGroupName,
    }),
    release: Flags.string({
      summary: messages.getMessage('flags.release.summary'),
      description: messages.getMessage('flags.release.description'),
      options: ['preview', 'previous'],
      helpGroup: definitionFileHelpGroupName,
    }),
    'admin-email': Flags.string({
      summary: messages.getMessage('flags.admin-email.summary'),
      helpGroup: definitionFileHelpGroupName,
    }),
    'source-org': Flags.salesforceId({
      summary: messages.getMessage('flags.source-org.summary'),
      startsWith: '00D',
      length: 15,
      helpGroup: definitionFileHelpGroupName,
      // salesforceId flag has `i` and that would be a conflict with client-id
      char: undefined,
    }),
  };

  public async run(): Promise<ScratchCreateResponse> {
    const lifecycle = Lifecycle.getInstance();
    const { flags } = await this.parse(OrgCreateScratch);
    const baseUrl = flags['target-dev-hub'].getField(Org.Fields.INSTANCE_URL)?.toString();
    if (!baseUrl) {
      throw new SfError('No instance URL found for the dev hub');
    }

    const createCommandOptions = await buildScratchOrgRequest(
      flags,
      flags['client-id'] ? await this.secretPrompt({ message: messages.getMessage('prompt.secret') }) : undefined
    );

    let asyncInstance: Instance | undefined;
    let statusInstance: Instance | undefined;
    let scratchOrgLifecycleData: ScratchOrgLifecycleEvent | undefined;

    if (flags.async) {
      asyncInstance = render(
        <SpinnerOrError type="dots2" label=" Requesting Scratch Org (will not wait for completion because --async)" />
      );
    } else {
      statusInstance = render(<Status baseUrl={baseUrl} />);
      lifecycle.on<ScratchOrgLifecycleEvent>(scratchOrgLifecycleEventName, async (data): Promise<void> => {
        scratchOrgLifecycleData = data;
        statusInstance?.rerender(<Status data={data} baseUrl={baseUrl} />);
        if (data.stage === 'done') {
          statusInstance?.unmount();
        }
        return Promise.resolve();
      });
    }

    try {
      const { username, scratchOrgInfo, authFields, warnings } = await scratchOrgCreate(createCommandOptions);

      if (!scratchOrgInfo) {
        throw new SfError('The scratch org did not return with any information');
      }
      this.log();
      if (flags.async) {
        asyncInstance?.clear();
        asyncInstance?.unmount();
        this.info(messages.getMessage('action.resume', [this.config.bin, scratchOrgInfo.Id]));
      } else {
        this.logSuccess(messages.getMessage('success'));
      }

      return { username, scratchOrgInfo, authFields, warnings, orgId: authFields?.orgId };
    } catch (error) {
      if (asyncInstance) {
        asyncInstance.unmount();
      }

      if (statusInstance) {
        statusInstance.rerender(<Status data={scratchOrgLifecycleData} error={error as Error} baseUrl={baseUrl} />);
        statusInstance.unmount();
      }

      if (error instanceof SfError && error.name === 'ScratchOrgInfoTimeoutError') {
        const scratchOrgInfoId = (error.data as { scratchOrgInfoId: string }).scratchOrgInfoId;
        const resumeMessage = messages.getMessage('action.resume', [this.config.bin, scratchOrgInfoId]);

        this.info(resumeMessage);
        this.error('The scratch org did not complete within your wait time', { code: '69', exit: 69 });
      } else {
        throw error;
      }
    }
  }
}

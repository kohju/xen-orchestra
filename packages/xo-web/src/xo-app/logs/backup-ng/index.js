import _, { FormattedDuration } from 'intl'
import ActionButton from 'action-button'
import addSubscriptions from 'add-subscriptions'
import decorate from 'apply-decorators'
import Icon from 'icon'
import NoObjects from 'no-objects'
import React from 'react'
import SortedTable from 'sorted-table'
import { alert } from 'modal'
import { Card, CardHeader, CardBlock } from 'card'
import { connectStore, formatSize } from 'utils'
import { createGetObjectsOfType } from 'selectors'
import { get } from '@xen-orchestra/defined'
import { injectState, provideState } from 'reaclette'
import { isEmpty, filter, map, keyBy } from 'lodash'
import {
  subscribeBackupNgJobs,
  subscribeBackupNgLogs,
  subscribeMetadataBackupJobs,
} from 'xo'

import LogAlertBody from './log-alert-body'
import LogAlertHeader from './log-alert-header'

import { STATUS_LABELS, LOG_FILTERS, LogDate } from '../utils'

const UL_STYLE = { listStyleType: 'none' }

const LI_STYLE = {
  whiteSpace: 'nowrap',
}

const showTasks = id =>
  alert(<LogAlertHeader id={id} />, <LogAlertBody id={id} />)

export const LogStatus = ({ log, tooltip = _('logDisplayDetails') }) => {
  const { className, label } = STATUS_LABELS[log.status]
  return (
    <ActionButton
      btnStyle={className}
      disabled={log.status !== 'failure' && isEmpty(log.tasks)}
      handler={showTasks}
      handlerParam={log.id}
      icon='preview'
      size='small'
      tooltip={tooltip}
    >
      {_(label)}
    </ActionButton>
  )
}

const COLUMNS = [
  {
    name: _('jobId'),
    itemRenderer: log => log.jobId.slice(4, 8),
    sortCriteria: log => log.jobId,
  },
  {
    name: _('jobName'),
    itemRenderer: (log, { jobs }) => get(() => jobs[log.jobId].name),
    sortCriteria: (log, { jobs }) => get(() => jobs[log.jobId].name),
  },
  {
    name: _('jobStart'),
    itemRenderer: log => <LogDate time={log.start} />,
    sortCriteria: 'start',
    sortOrder: 'desc',
  },
  {
    default: true,
    name: _('jobEnd'),
    itemRenderer: log => log.end !== undefined && <LogDate time={log.end} />,
    sortCriteria: log => log.end || log.start,
    sortOrder: 'desc',
  },
  {
    name: _('jobDuration'),
    itemRenderer: log =>
      log.end !== undefined && (
        <FormattedDuration duration={log.end - log.start} />
      ),
    sortCriteria: log => log.end - log.start,
  },
  {
    name: _('jobStatus'),
    itemRenderer: log => <LogStatus log={log} />,
    sortCriteria: 'status',
  },
  {
    name: _('labelSize'),
    itemRenderer: ({ tasks: vmTasks, jobId }, { jobs }) => {
      if (get(() => jobs[jobId].type) !== 'backup' || isEmpty(vmTasks)) {
        return null
      }

      let transferSize = 0
      let mergeSize = 0
      vmTasks.forEach(({ tasks: targetSnapshotTasks = [] }) => {
        let vmTransferSize
        let vmMergeSize
        targetSnapshotTasks.forEach(({ message, tasks: operationTasks }) => {
          if (message !== 'export' || isEmpty(operationTasks)) {
            return
          }
          operationTasks.forEach(operationTask => {
            if (operationTask.status !== 'success') {
              return
            }
            if (
              operationTask.message === 'transfer' &&
              vmTransferSize === undefined
            ) {
              vmTransferSize = operationTask.result.size
            }
            if (
              operationTask.message === 'merge' &&
              vmMergeSize === undefined
            ) {
              vmMergeSize = operationTask.result.size
            }

            if (vmTransferSize !== undefined && vmMergeSize !== undefined) {
              return false
            }
          })
        })
        vmTransferSize !== undefined && (transferSize += vmTransferSize)
        vmMergeSize !== undefined && (mergeSize += vmMergeSize)
      })
      return (
        <ul style={UL_STYLE}>
          {transferSize > 0 && (
            <li style={LI_STYLE}>
              {_.keyValue(_('labelTransfer'), formatSize(transferSize))}
            </li>
          )}
          {mergeSize > 0 && (
            <li style={LI_STYLE}>
              {_.keyValue(_('labelMerge'), formatSize(mergeSize))}
            </li>
          )}
        </ul>
      )
    },
  },
]

export default decorate([
  connectStore({
    vms: createGetObjectsOfType('VM'),
  }),
  addSubscriptions({
    logs: cb =>
      subscribeBackupNgLogs(logs =>
        cb(logs && filter(logs, log => log.message !== 'restore'))
      ),
    jobs: cb => subscribeBackupNgJobs(jobs => cb(keyBy(jobs, 'id'))),
    metadataJobs: cb =>
      subscribeMetadataBackupJobs(jobs => cb(keyBy(jobs, 'id'))),
  }),
  provideState({
    computed: {
      logs: (_, { logs, vms }) =>
        logs &&
        logs.map(log =>
          log.tasks !== undefined
            ? {
                ...log,
                // "vmNames" can contains undefined entries
                vmNames: map(log.tasks, ({ data }) =>
                  get(() => vms[data.id].name_label)
                ),
              }
            : log
        ),
      jobs: (_, { jobs, metadataJobs }) => ({ ...jobs, ...metadataJobs }),
    },
  }),
  injectState,
  ({ state, jobs }) => (
    <Card>
      <CardHeader>
        <Icon icon='logs' /> {_('logTitle')}
      </CardHeader>
      <CardBlock>
        <NoObjects
          collection={state.logs}
          columns={COLUMNS}
          component={SortedTable}
          data-jobs={state.jobs}
          emptyMessage={_('noLogs')}
          filters={LOG_FILTERS}
        />
      </CardBlock>
    </Card>
  ),
])

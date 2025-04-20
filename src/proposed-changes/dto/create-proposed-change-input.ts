export interface CreateProposedChangeInput {
    entityType: 'program' | 'schedule';
    action: 'create' | 'update' | 'delete';
    channelName: string;
    programName: string;
    before: any;
    after: any;
  }
import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import TestResultsSummaryDataSkinAdapter from '../adapters/TestResultsSummaryDataSkinAdapter';
import DetailedResultsSummaryDataSkinAdapter from '../adapters/DetailedResultsSummaryDataSkinAdapter';
import AttachmentsDataFactory from './AttachmentsDataFactory';

export default class ResultDataFactory {
  isSuiteSpecific = false;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;
  testPlanId: number;
  testSuiteArray: number[];
  adoptedResultDataArray: any[];
  templatePath: string;
  includeAttachments: boolean;
  includeConfigurations: boolean;
  includeHierarchy: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  attachmentsBucketName: string;
  attachmentMinioData: any[];

  constructor(
    attachmentBucketName: string = '',
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    includeAttachments: boolean = false,
    includeConfigurations: boolean = false,
    includeHierarchy: boolean = false,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    this.attachmentsBucketName = attachmentBucketName;
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.includeAttachments = includeAttachments;
    this.includeConfigurations = includeConfigurations;
    this.includeHierarchy = includeHierarchy;
    this.dgDataProvider = dgDataProvider;
    this.templatePath = templatePath;
    if (testSuiteArray !== null) {
      this.isSuiteSpecific = true;
    }
    this.attachmentMinioData = [];
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
  }

  public async fetchGetCombinedResultsSummary() {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const combinedResultsItems: any[] = await resultDataProvider.getCombinedResultsSummary(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray,
        this.includeConfigurations,
        this.includeHierarchy
      );

      if (combinedResultsItems.length === 0) {
        throw `No test data found for the specified plan ${this.testPlanId}`;
      }

      //TODO: In the future add here the content control types and also handle the attachments
      this.adoptedResultDataArray = combinedResultsItems.map((item) => {
        const adoptedData = this.jsonSkinDataAdapter(item.skin, item.data);
        return { ...item, data: adoptedData };
      });
    } catch (error) {
      logger.error(`Error occurred while trying the fetch Test Group Result Summary Data ${error.message}`);
    }
  }

  public jsonSkinDataAdapter(adapterType: string = null, rawData: any[]): Promise<any> {
    //For now we will take only the TestGroupResultSummaryData
    try {
      let adoptedTestResultData;
      switch (adapterType) {
        case 'test-result-test-group-summary-table':
          const testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          adoptedTestResultData = testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdapter(rawData);
          break;

        case 'test-result-table':
          const testResultsSummaryDataSkinAdapter = new TestResultsSummaryDataSkinAdapter();
          adoptedTestResultData = testResultsSummaryDataSkinAdapter.jsonSkinDataAdapter(
            rawData,
            this.includeConfigurations
          );
          break;

        case 'detailed-test-result-table':
          const detailedTestResultsSkinAdapter = new DetailedResultsSummaryDataSkinAdapter(
            this.templatePath,
            this.teamProject
          );
          adoptedTestResultData = detailedTestResultsSkinAdapter.jsonSkinDataAdapter(rawData);
          break;
        case 'open-pcr-table':
          break;

        default:
          break;
      }
      return adoptedTestResultData;
    } catch (error) {
      logger.error(
        `Error occurred during build json Skin data adapter for adapter type: ${adapterType}, ${error.message}`
      );
    }
  }

  private async appendAttachmentsToRawData(rawData: any[]): Promise<any[]> {
    let rawDataWithAttachments: any[] = [];

    for (let i = 0; i < rawData.length; i++) {
      let attachmentsData = await this.generateAttachmentData(rawData[i].id);
      attachmentsData.forEach((item) => {
        let attachmentBucketData = {
          attachmentMinioPath: item.attachmentMinioPath,
          minioFileName: item.minioFileName,
        };
        this.attachmentMinioData.push(attachmentBucketData);
        if (item.ThumbMinioPath && item.minioThumbName) {
          let thumbBucketData = {
            attachmentMinioPath: item.ThumbMinioPath,
            minioFileName: item.minioThumbName,
          };
          this.attachmentMinioData.push(thumbBucketData);
        }
      });
      let testCaseWithAttachments: any = JSON.parse(JSON.stringify(rawData[i]));
      testCaseWithAttachments.attachmentsData = attachmentsData;
      rawDataWithAttachments.push(testCaseWithAttachments);
    }
    return rawDataWithAttachments;
  }

  private async generateAttachmentData(testCaseId) {
    try {
      let attachmentsfactory = new AttachmentsDataFactory(
        this.teamProject,
        testCaseId,
        this.templatePath,
        this.dgDataProvider
      );
      let attachmentsData = await attachmentsfactory.fetchWiAttachments(
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );
      return attachmentsData;
    } catch (e) {
      logger.error(`error fetching attachments data for test case ${testCaseId}`);
    }
  }

  public getAdoptedResultData(): any[] {
    return this.adoptedResultDataArray;
  }

  async getAttachmentsMinioData() {
    return this.attachmentMinioData;
  }
}

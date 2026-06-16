const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { SFNClient, SendTaskSuccessCommand } = require("@aws-sdk/client-sfn");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());
const sfn = new SFNClient();

// Llamado por Step Functions - guarda el Task Token
module.exports.saveTaskToken = async (event) => {
  const { orderId, step, taskToken } = event;
  const startedAt = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: process.env.WORKFLOW_TABLE,
    Item: {
      PK: `ORDER#${orderId}`,
      SK: `STEP#${step}`,
      orderId,
      step,
      taskToken,
      status: "PENDING",
      startedAt,
      tenantId: "mrsushi",
    },
  }));

  // Actualizar estado del pedido en mrsushi-orders
  await dynamo.send(new UpdateCommand({
    TableName: process.env.ORDERS_TABLE,
    Key: {
      PK: `ORDER#${orderId}`,
      SK: "METADATA",
    },
    UpdateExpression: "SET #s = :status",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": step },
  }));

  return { orderId, step };
};

// POST /workflow/complete - El trabajador completa un paso
module.exports.completeStep = async (event) => {
  const body = JSON.parse(event.body);
  const { orderId, step, assignedTo } = body;
  const completedAt = new Date().toISOString();

  // Obtener el taskToken guardado
  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.WORKFLOW_TABLE,
    KeyConditionExpression: "PK = :pk AND SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `ORDER#${orderId}`,
      ":sk": `STEP#${step}`,
    },
  }));

  const workflowItem = result.Items[0];
  if (!workflowItem) {
    return {
      statusCode: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Paso no encontrado" }),
    };
  }

  // Enviar éxito a Step Functions para que continúe el flujo
  await sfn.send(new SendTaskSuccessCommand({
    taskToken: workflowItem.taskToken,
    output: JSON.stringify({ orderId, step, assignedTo }),
  }));

  // Actualizar el paso como DONE
  await dynamo.send(new UpdateCommand({
    TableName: process.env.WORKFLOW_TABLE,
    Key: {
      PK: `ORDER#${orderId}`,
      SK: `STEP#${step}`,
    },
    UpdateExpression: "SET #s = :status, completedAt = :completedAt, assignedTo = :assignedTo",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: {
      ":status": "DONE",
      ":completedAt": completedAt,
      ":assignedTo": assignedTo,
    },
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ message: "Paso completado", orderId, step }),
  };
};

// GET /workflow/{orderId} - Ver todos los pasos de un pedido
module.exports.getWorkflow = async (event) => {
  const { orderId } = event.pathParameters;

  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.WORKFLOW_TABLE,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `ORDER#${orderId}`,
    },
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result.Items),
  };
};
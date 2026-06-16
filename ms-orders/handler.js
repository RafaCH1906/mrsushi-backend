const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");
const { v4: uuidv4 } = require("uuid");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());
const sfn = new SFNClient();

// POST /orders - Crear pedido
module.exports.createOrder = async (event) => {
  const body = JSON.parse(event.body);
  const orderId = uuidv4();
  const createdAt = new Date().toISOString();

  const item = {
    PK: `ORDER#${orderId}`,
    SK: "METADATA",
    orderId,
    customerId: body.customerId,
    origin: body.origin || "WEB", // WEB o RAPPI
    status: "RECEIVED",
    items: body.items,
    total: body.total,
    createdAt,
    tenantId: "mrsushi",
  };

  await dynamo.send(new PutCommand({
    TableName: process.env.ORDERS_TABLE,
    Item: item,
  }));

  // Iniciar Step Functions
  await sfn.send(new StartExecutionCommand({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    name: `order-${orderId}`,
    input: JSON.stringify({ orderId, origin: item.origin }),
  }));

  return {
    statusCode: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ message: "Pedido creado", orderId }),
  };
};

// GET /orders/{orderId} - Obtener pedido
module.exports.getOrder = async (event) => {
  const { orderId } = event.pathParameters;

  const result = await dynamo.send(new GetCommand({
    TableName: process.env.ORDERS_TABLE,
    Key: {
      PK: `ORDER#${orderId}`,
      SK: "METADATA",
    },
  }));

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Pedido no encontrado" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result.Item),
  };
};

// GET /orders - Listar todos los pedidos
module.exports.listOrders = async () => {
  const result = await dynamo.send(new ScanCommand({
    TableName: process.env.ORDERS_TABLE,
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result.Items),
  };
};  
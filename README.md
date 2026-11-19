# FloorFlow

**Customers, orders, and smarter answers — all in one place.**

FloorFlow is a small web application built as a **technical take-home assignment during a recruitment process**. The goal was to create the first part of an order management system for a flooring contractor, with a simple interface and an AI assistant that can answer questions about the business.

**[Explore the live demo](https://floorflow.marcuslehm.se/)** · *Preview login required*

## The assignment

The original brief was to:

- Build a **PostgreSQL database** with customers, orders, order items, and articles.
- Create three pages using **HTML, CSS, and vanilla JavaScript**: a customer overview, customer details with their orders, and order details showing articles and quantities.
- Develop a **Node.js API in plain JavaScript** (not TypeScript) that also serves the web pages.
- Add an **AI chatbot** to the home page, using the database schema to answer questions such as *“How much have we sold?”* or *“How much has a particular customer spent?”* through a model deployed in Azure AI Foundry.
- Put the project on **GitHub** and set up GitHub Actions to deploy to **Azure App Service** on code pushes.

The emphasis was on keeping the code straightforward, understandable, and easy to explain.

## What you can explore

- Browse customers and their order history.
- View order details, materials, labor, quantities, and agreed prices.
- Ask the AI assistant questions about customers, articles, and sales in plain English.
- Inspect the query results and SQL behind the answers.

## How it works

FloorFlow uses **Node.js, Express, and vanilla JavaScript**, backed by **PostgreSQL** and **GPT-5-mini through Azure AI Foundry**.

The assistant turns natural-language questions into SQL. Before execution, the SQL is checked against strict rules and run with read-only database permissions. Answers are built from the returned data rather than invented figures.

## Live deployment

The original assignment called for Azure App Service, but Azure subscription quota and capacity restrictions blocked that deployment. The working demo therefore runs in **Docker on an Ubuntu server**, published over HTTPS through **Cloudflare Tunnel**, while **PostgreSQL and the AI model remain in Microsoft Azure**.

Pushes to `main` are tested by GitHub Actions before a source-only release is published. A separate Ubuntu timer pulls only the artifact verified for the current commit, checks its integrity, and updates FloorFlow with health checks and rollback. See [the deployment runbook](docs/HYBRID_DEPLOYMENT.md).

FloorFlow uses fictional sample data, and its AI assistant is a prototype whose answers should be checked when accuracy matters.

## Documentation

For a deeper look into the project, including explanations of the code, architectural decisions, business rules, AI implementation, security, and deployment, see:

- [Technical Review Guide](docs/TECHNICAL_REVIEW_GUIDE.md)

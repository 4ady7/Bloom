import { expect, test } from "@playwright/test";

test("two people can leave and open a note", async ({ browser }) => {
  const ada = await browser.newContext();
  const bea = await browser.newContext();
  const adaPage = await ada.newPage();
  const beaPage = await bea.newPage();

  await adaPage.goto("/sign-up");
  await adaPage.getByLabel("What should they call you?").fill("Ada");
  await adaPage.getByLabel("Email").fill(`ada.${Date.now()}@example.com`);
  await adaPage.getByLabel("Password").fill("correct-horse");
  await adaPage.getByRole("button", { name: "Create your place" }).click();
  await adaPage.getByRole("button", { name: "Make a code" }).click();
  const code = (await adaPage.getByLabel("Invite code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  await beaPage.goto("/sign-up");
  await beaPage.getByLabel("What should they call you?").fill("Bea");
  await beaPage.getByLabel("Email").fill(`bea.${Date.now()}@example.com`);
  await beaPage.getByLabel("Password").fill("correct-horse");
  await beaPage.getByRole("button", { name: "Create your place" }).click();
  await beaPage.getByLabel("Their code").fill(code);
  await beaPage.getByRole("button", { name: "Join them" }).click();
  await expect(beaPage.getByRole("link", { name: "Give them something" })).toBeVisible();

  await adaPage.goto("/home");
  await adaPage.getByRole("link", { name: "Give them something" }).click();
  await adaPage.getByRole("button", { name: "A note" }).click();
  await adaPage.getByLabel("Your note").fill("The kitchen light was nice.");
  await adaPage.getByRole("button", { name: "See it first" }).click();
  await expect(adaPage.getByText("The kitchen light was nice.")).toBeVisible();
  await adaPage.getByRole("button", { name: "Leave it with them" }).click();
  await expect(adaPage.getByRole("heading", { name: "It's with them." })).toBeVisible();

  await beaPage.goto("/home");
  await expect(beaPage.getByText("Ada left something for you.")).toBeVisible();
  await beaPage.getByRole("link", { name: "Open" }).click();
  await beaPage.getByRole("button", { name: "Open" }).click();
  await expect(beaPage.getByText("The kitchen light was nice.")).toBeVisible();

  await ada.close();
  await bea.close();
});

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/ui/core/Icon",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Dialog,
    Button,
    Text,
    VBox,
    HBox,
    Icon,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend("zfsd_rep043.controller.SalesOrder", {
        onInit: function () {
            this._bSalesOrderSaved = false;
            this._bSalesOrderDraftSaved = false;
            this._oSalesOrderDraftContext = null;
            this._aSalesOrderDraftItemContexts = [];

            this.getView().setModel(new JSONModel({
                customerDetailsVisible: true,
                serviceDetailsVisible: true,
                attachmentsVisible: true,
                selectedShipToKey: "",
                selectedShipToAddress: "",
                selectedAttachmentName: ""
            }), "uiModel");

            this.getOwnerComponent().getRouter().getRoute("RouteSalesOrder")
                .attachPatternMatched(this._onObjectMatched, this);
        },

_onObjectMatched: function (oEvent) {
    this._bSalesOrderSaved = false;
    this._bSalesOrderDraftSaved = false;
    this._oSalesOrderDraftContext = null;
    this._aSalesOrderDraftItemContexts = [];

    var sQuotation =
        oEvent.getParameter(
            "arguments"
        ).qNumber;

    var oQuotationModel =
        this.getOwnerComponent().getModel(
            "quotationModel"
        );

    var aQuotations =
        oQuotationModel
            ? oQuotationModel.getProperty(
                "/quotations"
            ) || []
            : [];

    var oSelectedQuotation =
        aQuotations.find(function (
            oQuotation
        ) {
            return (
                String(
                    oQuotation.qNumber || ""
                ) ===
                String(
                    sQuotation || ""
                )
            );
        });

    if (!oSelectedQuotation) {
        MessageToast.show(
            "Selected quotation data was not found."
        );

        return;
    }

    /*
     * Create a separate copy for Screen 2.
     *
     * This avoids changing the quotation-list object
     * directly when Screen 2 values are edited.
     */
    var oSelected =
        Object.assign(
            {},
            oSelectedQuotation
        );

    /*
     * Normalize the organizational country returned
     * by the quotation OData service.
     *
     * Expected values:
     * BE = Belgium
     * IT = Italy
     */
    var sCountryCode =
        String(
            oSelected.countryCode || ""
        ).trim().toUpperCase();

    oSelected.countryCode =
        sCountryCode;

    /*
     * Buyer Reference is visible only for Belgium.
     */
    oSelected.buyerReferenceVisible =
        sCountryCode === "BE";

    /*
     * Never retain Buyer Reference for Italy or
     * any non-Belgium quotation.
     */
    if (!oSelected.buyerReferenceVisible) {
        oSelected.buyerReference = "";
    }

    if (
        !oSelected.shipToOptions ||
        !oSelected.shipToOptions.length
    ) {
        oSelected.shipToOptions = [
            {
                key: "1",
                text:
                    "No ship-to address maintained",
                addressId: ""
            }
        ];
    }

    oSelected.attachments =
        oSelected.attachments || [];

    oSelected.items = [];
    oSelected.totals = [];
    oSelected.draftSaved = false;
    oSelected.draftLoaded = false;
    oSelected.preparationUUID = "";

    var oSelectedQuotationModel =
        new JSONModel(
            oSelected
        );

    /*
     * Force binding updates immediately after the
     * model is assigned to Screen 2.
     */
    oSelectedQuotationModel.setDefaultBindingMode(
        "TwoWay"
    );

    this.getView().setModel(
        oSelectedQuotationModel,
        "selectedQuotation"
    );

    oSelectedQuotationModel.refresh(
        true
    );
this._updateBuyerReferenceVisibility();
    var oFirstShipTo =
        oSelected.shipToOptions[0];

    var sAddress =
        oFirstShipTo.text || "";

    if (oFirstShipTo.addressId) {
        sAddress +=
            " - Address ID: " +
            oFirstShipTo.addressId;
    }

    this.getView()
        .getModel("uiModel")
        .setProperty(
            "/selectedShipToKey",
            oFirstShipTo.key
        );

    this.getView()
        .getModel("uiModel")
        .setProperty(
            "/selectedShipToAddress",
            sAddress
        );

    this.getView()
        .getModel("uiModel")
        .setProperty(
            "/selectedAttachmentName",
            ""
        );

    this._loadExistingSalesOrderDraft(
        sQuotation
    );
},

        _loadExistingSalesOrderDraft: function (sQuotationNumber) {
            var oModel = this.getOwnerComponent().getModel("quotationOData");
            var oScreenModel = this.getView().getModel("selectedQuotation");
            if (!oModel || !oScreenModel) {
                MessageToast.show("Sales Order preparation service is not available.");
                return;
            }

            this.getView().setBusy(true);
            var oList = oModel.bindList("/SalesOrderPreparations", null, null, [
                new Filter("QuotationNumber", FilterOperator.EQ, sQuotationNumber),
                new Filter("IsActiveEntity", FilterOperator.EQ, false)
            ]);

            oList.requestContexts(0, 20).then(function (aContexts) {
                if (!aContexts.length) {
                    this._loadNormalQuotationValues(sQuotationNumber);
                    return;
                }

                aContexts.sort(function (a, b) {
                    var A = a.getObject();
                    var B = b.getObject();
                    return String(B.DraftEntityLastChangeDateTime || B.LocalLastChangedAt || "")
                        .localeCompare(String(A.DraftEntityLastChangeDateTime || A.LocalLastChangedAt || ""));
                });

                this._oSalesOrderDraftContext = aContexts[0];
                var oItemBinding = oModel.bindList("_Item", this._oSalesOrderDraftContext);
                return Promise.all([
                    this._oSalesOrderDraftContext.requestObject(),
                    oItemBinding.requestContexts(0, 500)
                ]).then(function (aResults) {
                    this._aSalesOrderDraftItemContexts = aResults[1];
                    this._applySalesOrderDraftToScreen(
                        aResults[0],
                        aResults[1].map(function (oContext) { return oContext.getObject(); })
                    );
                   this._showInformationMessage(
    "The most recent saved draft has been loaded."
);
                }.bind(this));
            }.bind(this)).catch(function (oError) {
                console.error("REP043 existing draft loading failed:", oError);
                this._loadNormalQuotationValues(sQuotationNumber);
                MessageToast.show("Existing draft could not be loaded. Current quotation values were loaded.");
            }.bind(this)).finally(function () {
                this.getView().setBusy(false);
            }.bind(this));
        },

        _loadNormalQuotationValues: function (sQuotationNumber) {
            var oScreenModel = this.getView().getModel("selectedQuotation");
            this._oSalesOrderDraftContext = null;
            this._aSalesOrderDraftItemContexts = [];
            this._bSalesOrderDraftSaved = false;
            oScreenModel.setProperty("/preparationUUID", "");
            oScreenModel.setProperty("/draftSaved", false);
            oScreenModel.setProperty("/draftLoaded", false);
            oScreenModel.setProperty("/additionalInfo", "");
            oScreenModel.setProperty(
    "/buyerReferenceVisible",
    String(
        oScreenModel.getProperty(
            "/countryCode"
        ) || ""
    ).trim().toUpperCase() === "BE"
);
            oScreenModel.setProperty(
    "/postingDate",
    oScreenModel.getProperty(
        "/originalPostingDate"
    ) || ""
);
            
            
oScreenModel.setProperty("/customerPoNum", oScreenModel.getProperty("/poNumber") || "");
this._updateBuyerReferenceVisibility();
            this._setDefaultServiceDates(oScreenModel);
            this._loadQuotationItems(sQuotationNumber);
        },

        _applySalesOrderDraftToScreen: function (oDraft, aDraftItems) {
            var oModel = this.getView().getModel("selectedQuotation");
            oModel.setProperty("/preparationUUID", oDraft.PreparationUUID || "");
            oModel.setProperty("/draftSaved", true);
            oModel.setProperty("/draftLoaded", true);
            this._bSalesOrderDraftSaved = true;

            oModel.setProperty("/customerPoNum", oDraft.CustomerPONumber || "");
            oModel.setProperty("/postingDate", oDraft.PostingDate || "");
            oModel.setProperty("/serviceDateFrom", oDraft.ServiceDateFrom || "");
            oModel.setProperty("/serviceDateTo", oDraft.ServiceDateTo || "");
            oModel.setProperty("/additionalInfo", oDraft.AdditionalInfo || "");
            var sCountryCode =
    String(
        oModel.getProperty(
            "/countryCode"
        ) || ""
    ).trim().toUpperCase();

var bBuyerReferenceVisible =
    sCountryCode === "BE";

oModel.setProperty(
    "/countryCode",
    sCountryCode
);

oModel.setProperty(
    "/buyerReferenceVisible",
    bBuyerReferenceVisible
);

oModel.setProperty(
    "/buyerReference",
    bBuyerReferenceVisible
        ? oDraft.BuyerReference || ""
        : ""
);

oModel.refresh(
    true
);
this._updateBuyerReferenceVisibility();
            oModel.setProperty("/currency", oDraft.Currency || "");
            oModel.setProperty("/profitCenter", oDraft.ProfitCenter || "");

            var aItems = (aDraftItems || []).map(function (o) {
                var fNet = Number(o.NetAmount) || 0;
                var fTax = Number(o.TaxAmount) || 0;
                return {
                    preparationUUID: o.PreparationUUID || oDraft.PreparationUUID || "",
                    quotationNumber: o.QuotationNumber || oDraft.QuotationNumber || "",
                    quotationItem: o.QuotationItem || "",
                    itemCategory: o.ItemCategory || "",
                    article: o.Material || "",
                    articleDescription: o.MaterialDescription || "",
                    additionalDescription: o.AdditionalDescription || "",
                    customerMaterial: o.CustomerMaterial || "",
                    quotationQuantity: Number(o.QuotationQuantity) || 0,
                    referencedQuantity: Number(o.ReferencedQuantity) || 0,
                    remainingQuantity: Number(o.RemainingQuantity) || 0,
                    quantity: Number(o.SalesOrderQuantity) || 0,
                    quantityUnit: o.QuantityUnit || "",
                    fixedQuantityIndicator: Boolean(o.FixedQuantityIndicator),
                    plant: o.Plant || "",
                    wbsInternalId: o.WbsInternalID || "",
                    wbs: o.WbsElementL2 || "",
                    wbsHierarchyLevel: Number(o.WbsHierarchyLevel) || 0,
                    projectNumber: o.ProjectNumber || "",
                    projectDescription: o.ProjectDescription || "",
                    profitCenterSite: o.ProfitCenterSite || "",
                    unitPrice: Number(o.UnitPrice) || 0,
                    netPriceQuantity: Number(o.NetPriceQuantity) || 1,
                    netPriceQuantityUnit: o.NetPriceQuantityUnit || "",
                    currency: o.Currency || oDraft.Currency || "",
                    netTotal: fNet.toFixed(2),
                    calculatedTaxAmount: fTax.toFixed(2),
                    gross: (Number(o.GrossAmount) || 0).toFixed(2),
                    vat: (fNet > 0 ? fTax / fNet * 100 : 0).toFixed(2),
                    referenceDocument: o.ReferenceDocument || "",
                    referenceDocumentItem: o.ReferenceDocumentItem || "",
                    itemProcessStatus: o.ItemProcessStatus || "",
                    itemReferenceStatus: o.ItemReferenceStatus || "",
                    rejectionReason: o.RejectionReason || "",
                    rejectionStatus: o.RejectionStatus || ""
                };
            });
            oModel.setProperty("/items", aItems);
            this._calculateSalesOrderTotals();
            console.log("REP043 recent Sales Order draft loaded:", oDraft);
            console.log("REP043 draft items applied to Screen 2:", aItems);
        },

_setDefaultServiceDates: function (
    oModel
) {
    if (!oModel) {
        return;
    }

    /*
     * Posting Date is supplied by the quotation model.
     *
     * The backend source will be VBAK-PSM_BUDAT.
     * Do not overwrite Posting Date with today's date.
     */
    var sPostingDate =
        oModel.getProperty(
            "/postingDate"
        ) || "";

    /*
     * If VBAK-PSM_BUDAT is empty, leave the dates empty.
     *
     * The Posting Date DatePicker remains editable,
     * so the user can enter a date manually.
     */
    if (!sPostingDate) {
        oModel.setProperty(
            "/serviceDateFrom",
            ""
        );

        oModel.setProperty(
            "/serviceDateTo",
            ""
        );

        return;
    }

    var aDateParts =
        String(
            sPostingDate
        ).substring(
            0,
            10
        ).split(
            "-"
        );

    if (aDateParts.length !== 3) {
        oModel.setProperty(
            "/serviceDateFrom",
            ""
        );

        oModel.setProperty(
            "/serviceDateTo",
            ""
        );

        return;
    }

    var iYear =
        Number(
            aDateParts[0]
        );

    var iMonth =
        Number(
            aDateParts[1]
        ) - 1;

    var iDay =
        Number(
            aDateParts[2]
        );

    var oPostingDate =
        new Date(
            iYear,
            iMonth,
            iDay
        );

    if (
        Number.isNaN(
            oPostingDate.getTime()
        )
    ) {
        oModel.setProperty(
            "/serviceDateFrom",
            ""
        );

        oModel.setProperty(
            "/serviceDateTo",
            ""
        );

        return;
    }

    var oFirstDayOfMonth =
        new Date(
            oPostingDate.getFullYear(),
            oPostingDate.getMonth(),
            1
        );

    var oLastDayOfMonth =
        new Date(
            oPostingDate.getFullYear(),
            oPostingDate.getMonth() + 1,
            0
        );

    var fnFormatDate = function (
        oDate
    ) {
        return (
            String(
                oDate.getFullYear()
            ) +
            "-" +
            String(
                oDate.getMonth() + 1
            ).padStart(
                2,
                "0"
            ) +
            "-" +
            String(
                oDate.getDate()
            ).padStart(
                2,
                "0"
            )
        );
    };

    /*
     * Keep the backend Posting Date unchanged.
     * Default only the service-date range.
     */
    oModel.setProperty(
        "/serviceDateFrom",
        fnFormatDate(
            oFirstDayOfMonth
        )
    );

    oModel.setProperty(
        "/serviceDateTo",
        fnFormatDate(
            oLastDayOfMonth
        )
    );
},
        onPostingDateChange: function (oEvent) {
            var d = oEvent.getSource().getDateValue();
            var oModel = this.getView().getModel("selectedQuotation");
            if (!d) {
                oModel.setProperty("/serviceDateFrom", "");
                oModel.setProperty("/serviceDateTo", "");
                return;
            }
            var fn = function (x) {
                return String(x.getFullYear()) + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
            };
            oModel.setProperty("/postingDate", fn(d));
            oModel.setProperty("/serviceDateFrom", fn(new Date(d.getFullYear(), d.getMonth(), 1)));
            oModel.setProperty("/serviceDateTo", fn(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
        },

        _loadQuotationItems: function (sQuotationNumber) {
            var oModel = this.getOwnerComponent().getModel("quotationOData");
            var oScreen = this.getView().getModel("selectedQuotation");
            var oBinding = oModel.bindList("/QuotationItems", null, null, [
                new Filter("QuotationNumber", FilterOperator.EQ, sQuotationNumber)
            ], { $select: [
                "QuotationNumber","QuotationItem","ItemCategory","ItemDescription","Material","CustomerMaterial",
                "QuotationQuantity","ReferencedQuantity","RemainingQuantity","QuantityUnit","Plant","WbsInternalID",
                "WbsElementL2","WbsHierarchyLevel","ProfitCenterSite","ProjectNumber","ProjectDescription","UnitPrice",
                "NetPriceQuantity","NetPriceQuantityUnit","NetAmount","TaxAmount","Currency","ReferenceDocument",
                "ReferenceDocumentItem","ItemProcessStatus","ItemReferenceStatus","RejectionReason","RejectionStatus"
            ].join(",") });

            oBinding.requestContexts(0, 500).then(function (aContexts) {
                var aItems = aContexts.map(function (c) {
                    return this._mapBackendQuotationItem(c.getObject());
                }.bind(this)).filter(function (o) {
                    return o.remainingQuantity > 0 && !o.rejectionReason;
                });
                oScreen.setProperty("/items", aItems);
                this._calculateSalesOrderTotals();
                var oFirst = aItems[0];
                oScreen.setProperty("/profitCenter", oFirst ? oFirst.profitCenterSite || "" : "");
                oScreen.setProperty("/projectNumber", oFirst ? oFirst.projectNumber || "" : "");
                oScreen.setProperty("/projectDescription", oFirst ? oFirst.projectDescription || "" : "");
            }.bind(this)).catch(function (oError) {
                console.error("REP043 quotation item loading failed:", oError);
                oScreen.setProperty("/items", []);
                oScreen.setProperty("/totals", []);
                MessageToast.show("Unable to load quotation items.");
            });
        },

        _mapBackendQuotationItem: function (o) {
            var q = Number(o.QuotationQuantity) || 0;
            var r = Number(o.ReferencedQuantity) || 0;
            var rem = Number(o.RemainingQuantity) || 0;
            var price = Number(o.UnitPrice) || 0;
            var priceQty = Number(o.NetPriceQuantity) || 1;
            var quoteNet = Number(o.NetAmount) || 0;
            var quoteTax = Number(o.TaxAmount) || 0;
            var vat = quoteNet > 0 ? quoteTax / quoteNet * 100 : 0;
            var net = rem > 0 ? rem * price / priceQty : 0;
            var tax = net * vat / 100;
            return {
                quotationNumber: o.QuotationNumber || "", quotationItem: o.QuotationItem || "", itemCategory: o.ItemCategory || "",
                article: o.Material || "", articleDescription: o.ItemDescription || "", additionalDescription: "",
                customerMaterial: o.CustomerMaterial || "", quotationQuantity: q, referencedQuantity: r,
                remainingQuantity: rem, quantity: rem, quantityUnit: o.QuantityUnit || "", plant: o.Plant || "",
                wbsInternalId: o.WbsInternalID || "", wbs: o.WbsElementL2 || "", wbsHierarchyLevel: Number(o.WbsHierarchyLevel) || 0,
                profitCenterSite: o.ProfitCenterSite || "", projectNumber: o.ProjectNumber || "",
                projectDescription: o.ProjectDescription || "", unitPrice: price, netPriceQuantity: priceQty,
                netPriceQuantityUnit: o.NetPriceQuantityUnit || "", currency: o.Currency || "", vat: vat.toFixed(2),
                netTotal: net.toFixed(2), calculatedTaxAmount: tax.toFixed(2), gross: (net + tax).toFixed(2),
                referenceDocument: o.ReferenceDocument || "", referenceDocumentItem: o.ReferenceDocumentItem || "",
                itemProcessStatus: o.ItemProcessStatus || "", itemReferenceStatus: o.ItemReferenceStatus || "",
                rejectionReason: o.RejectionReason || "", rejectionStatus: o.RejectionStatus || ""
            };
        },

        onItemQuantityChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("selectedQuotation");
            if (!oCtx) { return; }
            var oModel = this.getView().getModel("selectedQuotation");
            var sPath = oCtx.getPath();
            var o = oCtx.getObject();
            var qty = Number(o.quantity) || 0;
            if (qty > Number(o.remainingQuantity || 0)) {
                qty = Number(o.remainingQuantity || 0);
                oModel.setProperty(sPath + "/quantity", qty);
                this._showWarningMessage(
    "The Sales Order quantity cannot exceed the remaining quotation quantity.",

    "Quantity exceeds remaining quantity"
);
            }
            var net = qty > 0 ? qty * (Number(o.unitPrice) || 0) / (Number(o.netPriceQuantity) || 1) : 0;
            var tax = net * (Number(o.vat) || 0) / 100;
            oModel.setProperty(sPath + "/netTotal", net.toFixed(2));
            oModel.setProperty(sPath + "/calculatedTaxAmount", tax.toFixed(2));
            oModel.setProperty(sPath + "/gross", (net + tax).toFixed(2));
            this._calculateSalesOrderTotals();
        },

        _calculateSalesOrderTotals: function () {
            var oModel = this.getView().getModel("selectedQuotation");
            var aItems = oModel.getProperty("/items") || [];
            var groups = {}, netAll = 0, taxAll = 0, grossAll = 0;
            aItems.forEach(function (o) {
                if ((Number(o.quantity) || 0) <= 0) { return; }
                var key = (Number(o.vat) || 0).toFixed(3);
                groups[key] = groups[key] || { vat: Number(o.vat) || 0, net: 0, tax: 0, gross: 0 };
                groups[key].net += Number(o.netTotal) || 0;
                groups[key].tax += Number(o.calculatedTaxAmount) || 0;
                groups[key].gross += Number(o.gross) || 0;
                netAll += Number(o.netTotal) || 0;
                taxAll += Number(o.calculatedTaxAmount) || 0;
                grossAll += Number(o.gross) || 0;
            });
            var aTotals = Object.keys(groups).map(function (k) {
                return { vat: groups[k].vat.toFixed(2), totalNet: groups[k].net.toFixed(2),
                    totalVat: groups[k].tax.toFixed(2), totalGross: groups[k].gross.toFixed(2), isGrandTotal: false };
            }).sort(function (a, b) { return Number(a.vat) - Number(b.vat); });
            if (aTotals.length) {
                aTotals.push({ vat: "TOTAL", totalNet: netAll.toFixed(2), totalVat: taxAll.toFixed(2),
                    totalGross: grossAll.toFixed(2), isGrandTotal: true });
            }
            oModel.setProperty("/totals", aTotals);
        },

        onSave: function () {
            var oModel = this.getOwnerComponent().getModel("quotationOData");
            var oScreenModel = this.getView().getModel("selectedQuotation");
            var oData = oScreenModel.getData();
            if (!oData.qNumber || !(oData.items || []).length) {
                MessageToast.show("No quotation items are available to save.");
                return;
            }
            this.getView().setBusy(true);

            if (this._oSalesOrderDraftContext) {
                this._updateExistingDraft(oData).then(function () {
                    this._bSalesOrderDraftSaved = true;
                    oScreenModel.setProperty("/draftSaved", true);
                    oScreenModel.setProperty("/draftLoaded", true);
                    this._showSuccessMessage(
    "Draft updated successfully."
);
                }.bind(this)).catch(this._handleDraftError.bind(this)).finally(function () {
                    this.getView().setBusy(false);
                }.bind(this));
                return;
            }

            var oList = oModel.bindList("/SalesOrderPreparations", null, null, null, { $$updateGroupId: "salesOrderDraft" });
            var oContext = oList.create(this._buildSalesOrderDraftPayload(oData));
            oModel.submitBatch("salesOrderDraft").then(function () {
                return oContext.created();
            }).then(function () {
                this._oSalesOrderDraftContext = oContext;
                return oContext.requestObject();
            }.bind(this)).then(function (oSaved) {
                var oItems = oModel.bindList("_Item", oContext);
                return oItems.requestContexts(0, 500).then(function (aContexts) {
                    this._aSalesOrderDraftItemContexts = aContexts;
                    oScreenModel.setProperty("/preparationUUID", oSaved.PreparationUUID || "");
                    oScreenModel.setProperty("/draftSaved", true);
                    oScreenModel.setProperty("/draftLoaded", true);
                    this._bSalesOrderDraftSaved = true;
                    this._showSuccessMessage(
    "Draft saved successfully."
);
                }.bind(this));
            }.bind(this)).catch(this._handleDraftError.bind(this)).finally(function () {
                this.getView().setBusy(false);
            }.bind(this));
        },

_updateExistingDraft: function (
    oData
) {
    var oQuotationODataModel =
        this.getOwnerComponent().getModel(
            "quotationOData"
        );

    var oHeaderContext =
        this._oSalesOrderDraftContext;

    if (
        !oQuotationODataModel ||
        !oHeaderContext
    ) {
        return Promise.reject(
            new Error(
                "Existing draft context is unavailable."
            )
        );
    }

    /*
     * Update only editable header properties.
     *
     * Event Name was removed from the UI,
     * so save it as blank.
     */
    var mHeaderUpdates = {
        CustomerPONumber:
            String(
                oData.customerPoNum || ""
            ).trim(),

        PostingDate:
            String(
                oData.postingDate || ""
            ),

        ServiceDateFrom:
            String(
                oData.serviceDateFrom || ""
            ),

        ServiceDateTo:
            String(
                oData.serviceDateTo || ""
            ),

        AdditionalInfo:
            String(
                oData.additionalInfo || ""
            ),

BuyerReference:
    String(
        oData.countryCode || ""
    ).trim().toUpperCase() === "BE"
        ? String(
            oData.buyerReference || ""
        )
        : "",

        EventName:
            "",

        AdditionalNotes:
            ""
    };

    Object.keys(
        mHeaderUpdates
    ).forEach(function (sProperty) {
        oHeaderContext.setProperty(
            sProperty,
            mHeaderUpdates[sProperty],
            "salesOrderDraft"
        );
    });

    /*
     * Only SalesOrderQuantity and
     * AdditionalDescription are editable
     * on the preparation item.
     *
     * NetAmount, TaxAmount and GrossAmount
     * are immutable according to the service metadata.
     */
    (oData.items || []).forEach(
        function (oScreenItem) {
            var oItemContext =
                this._aSalesOrderDraftItemContexts
                    .find(function (oContext) {
                        return (
                            String(
                                oContext.getProperty(
                                    "QuotationItem"
                                ) || ""
                            ) ===
                            String(
                                oScreenItem
                                    .quotationItem ||
                                ""
                            )
                        );
                    });

            if (!oItemContext) {
                return;
            }

            oItemContext.setProperty(
                "SalesOrderQuantity",
                Number(
                    oScreenItem.quantity || 0
                ).toFixed(3),
                "salesOrderDraft"
            );

            oItemContext.setProperty(
                "AdditionalDescription",
                String(
                    oScreenItem
                        .additionalDescription ||
                    ""
                ),
                "salesOrderDraft"
            );
        }.bind(this)
    );

    return oQuotationODataModel.submitBatch(
        "salesOrderDraft"
    );
},

_handleDraftError: function (oError) {
    console.error(
        "REP043 draft operation failed:",
        oError
    );

    var sErrorMessage =
        "The draft operation could not be completed.";

    if (
        oError &&
        oError.message
    ) {
        sErrorMessage =
            oError.message;
    }

    this._showErrorMessage(
        sErrorMessage,
        "Draft operation failed"
    );
},

        _buildSalesOrderDraftPayload: function (o) {
            return {
                QuotationNumber: String(o.qNumber || ""), QuotationType: String(o.quotationType || ""),
                SalesOrganization: String(o.salesOrganization || ""), DistributionChannel: String(o.distributionChannel || ""),
                OrganizationDivision: String(o.organizationDivision || ""), SoldToCustomer: String(o.soldToCustomerNumber || ""),
                SoldToCustomerName: String(o.soldToName || ""), SoldToAddressID: String(o.soldToAddressId || ""),
                BillToCustomer: String(o.billToCustomerNumber || ""), BillToCustomerName: String(o.billToName || ""),
                BillToAddressID: String(o.billToAddressId || ""), ShipToCustomer: String(o.shipToCustomerNumber || ""),
                ShipToCustomerName: String(o.shipToName || ""), ShipToAddressID: String(o.shipToAddressId || ""),
                CustomerPONumber: String(o.customerPoNum || "").trim(), PostingDate: String(o.postingDate || ""),
                ServiceDateFrom: String(o.serviceDateFrom || ""), ServiceDateTo: String(o.serviceDateTo || ""),
               EventName:
    "",

AdditionalInfo:
    String(
        o.additionalInfo || ""
    ),

BuyerReference:
    String(
    o.countryCode || ""
).trim().toUpperCase() === "BE"
        ? String(
            o.buyerReference || ""
        )
        : "",
                AdditionalNotes: "", Currency: String(o.currency || ""), ProfitCenter: String(o.profitCenter || ""),
                _Item: (o.items || []).map(function (i) {
                    return {
                        QuotationItem: String(i.quotationItem || ""), QuotationNumber: String(o.qNumber || ""),
                        ItemCategory: String(i.itemCategory || ""), Material: String(i.article || ""),
                        MaterialDescription: String(i.articleDescription || ""), AdditionalDescription: String(i.additionalDescription || ""),
                        CustomerMaterial: String(i.customerMaterial || ""), QuotationQuantity: Number(i.quotationQuantity || 0).toFixed(3),
                        ReferencedQuantity: Number(i.referencedQuantity || 0).toFixed(3), RemainingQuantity: Number(i.remainingQuantity || 0).toFixed(3),
                        SalesOrderQuantity: Number(i.quantity || 0).toFixed(3), QuantityUnit: String(i.quantityUnit || ""),
                        FixedQuantityIndicator: Boolean(i.fixedQuantityIndicator), Plant: String(i.plant || ""),
                        WbsInternalID: String(i.wbsInternalId || ""), WbsElementL2: String(i.wbs || ""),
                        WbsHierarchyLevel: Number(i.wbsHierarchyLevel) || 0, ProjectNumber: String(i.projectNumber || ""),
                        ProjectDescription: String(i.projectDescription || ""), ProfitCenterSite: String(i.profitCenterSite || ""),
                        UnitPrice: Number(i.unitPrice || 0).toFixed(2), NetPriceQuantity: Number(i.netPriceQuantity || 1).toFixed(3),
                        NetPriceQuantityUnit: String(i.netPriceQuantityUnit || ""), NetAmount: Number(i.netTotal || 0).toFixed(2),
                        TaxAmount: Number(i.calculatedTaxAmount || 0).toFixed(2), GrossAmount: Number(i.gross || 0).toFixed(2),
                        Currency: String(i.currency || o.currency || ""), ReferenceDocument: String(i.referenceDocument || ""),
                        ReferenceDocumentItem: String(i.referenceDocumentItem || ""), ItemProcessStatus: String(i.itemProcessStatus || ""),
                        ItemReferenceStatus: String(i.itemReferenceStatus || ""), RejectionReason: String(i.rejectionReason || ""),
                        RejectionStatus: String(i.rejectionStatus || "")
                    };
                })
            };
        },

        _executeCreateSalesOrder: function () {
            var oModel = this.getOwnerComponent().getModel("quotationOData");
            var o = this.getView().getModel("selectedQuotation").getData();
            var aSelected = (o.items || []).filter(function (i) { return Number(i.quantity) > 0; });
            if (aSelected.length !== 1) {
                MessageToast.show(aSelected.length ? "Only one item can be processed in the current version." : "Enter a Sales Order quantity greater than zero.");
                return Promise.reject(new Error("Invalid selected item count."));
            }
            var i = aSelected[0];
            if (Number(i.quantity) > Number(i.remainingQuantity)) {
                MessageToast.show("Sales Order quantity exceeds the remaining quantity.");
                return Promise.reject(new Error("Quantity exceeds remaining quantity."));
            }
            var sPath = "/Quotations('" + String(o.qNumber).replace(/'/g, "''") + "')/com.sap.gateway.srvd_a2x.zebill_adhoc_sales_srv.v0001.CreateSalesOrder(...)";
            var b = oModel.bindContext(sPath);
            b.setParameter("QuotationItem", String(i.quotationItem));
            b.setParameter("SalesOrderQuantity", Number(i.quantity).toFixed(3));
            b.setParameter("QuantityUnit", String(i.quantityUnit));
            b.setParameter("ServiceDateFrom", String(o.serviceDateFrom));
            b.setParameter("ServiceDateTo", String(o.serviceDateTo));
            b.setParameter("PostingDate", String(o.postingDate));
            b.setParameter("EventName", "");
            b.setParameter("AdditionalInfo", o.additionalInfo || "");
            b.setParameter("CustomerPONumber", String(o.customerPoNum || "").trim());
            b.setParameter(
    "BuyerReference",
    String(
    o.countryCode || ""
).trim().toUpperCase() === "BE"
        ? String(
            o.buyerReference || ""
        )
        : ""
);
            b.setParameter("AdditionalNotes", "");
            b.setParameter("SaveAndPost", true);
            this.getView().setBusy(true);
            return b.invoke().then(function () {
                this._bSalesOrderSaved = true;
                this._showSuccessMessage(
    "Sales Order was created successfully."
);
            }.bind(this)).catch(function (e) {
                this._showErrorMessage(
    e && e.message
        ? e.message
        : "Sales Order could not be created.",

    "Sales Order creation failed"
);
                throw e;
            }).finally(function () { this.getView().setBusy(false); }.bind(this));
        },

        _showSuccessMessage: function (sMessage) {
    MessageToast.show(
        sMessage,
        {
            duration: 3500,
            width: "24rem",
            my: "center bottom",
            at: "center bottom",
            offset: "0 -3rem",
            collision: "fit fit",
            autoClose: true,
            animationTimingFunction: "ease-out",
            animationDuration: 250,
            closeOnBrowserNavigation: true
        }
    );
},

_showInformationMessage: function (sMessage) {
    MessageToast.show(
        sMessage,
        {
            duration: 3000,
            width: "24rem",
            my: "center bottom",
            at: "center bottom",
            offset: "0 -3rem",
            collision: "fit fit",
            autoClose: true,
            animationTimingFunction: "ease-out",
            animationDuration: 250,
            closeOnBrowserNavigation: true
        }
    );
},

_showWarningMessage: function (
    sMessage,
    sTitle
) {
    MessageBox.warning(
        sMessage,
        {
            title:
                sTitle ||
                "Check the entered information",

            styleClass:
                "rep043MessageBox",

            actions: [
                MessageBox.Action.OK
            ],

            emphasizedAction:
                MessageBox.Action.OK
        }
    );
},

_showErrorMessage: function (
    sMessage,
    sTitle
) {
    MessageBox.error(
        sMessage,
        {
            title:
                sTitle ||
                "Unable to complete the operation",

            styleClass:
                "rep043MessageBox",

            actions: [
                MessageBox.Action.CLOSE
            ],

            emphasizedAction:
                MessageBox.Action.CLOSE
        }
    );
},

onConfirmSalesOrder: function () {
    if (!this._oConfirmSalesOrderDialog) {
        this._oConfirmSalesOrderDialog =
            new Dialog({
                title:
                    "Confirm Sales Order",

                contentWidth:
                    "28rem",

                draggable:
                    false,

                resizable:
                    false,

                stretch:
                    false,

                verticalScrolling:
                    false,

                horizontalScrolling:
                    false,

                content: [
                    new HBox({
                        width:
                            "100%",

                        alignItems:
                            "Start",

                        items: [
                            new Icon({
                                src:
                                    "sap-icon://question-mark",

                                size:
                                    "1.5rem",

                                color:
                                    "#0a6ed1",

                                decorative:
                                    false,

                                tooltip:
                                    "Confirmation"
                            }).addStyleClass(
                                "rep043DialogIcon"
                            ),

                            new VBox({
                                width:
                                    "100%",

                                items: [
                                    new Text({
                                        text:
                                            "Create and post this Sales Order?",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogLead"
                                    ),

                                    new Text({
                                        text:
                                            "The Sales Order will be created using the quantities, dates, customer PO number and additional information currently shown on the screen.",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogDescription"
                                    )
                                ]
                            })
                        ]
                    }).addStyleClass(
                        "rep043DialogBody"
                    )
                ],

                buttons: [
                    new Button({
                        text:
                            "Cancel",

                        type:
                            "Transparent",

                        press: function () {
                            this._oConfirmSalesOrderDialog.close();
                        }.bind(this)
                    }),

                    new Button({
                        text:
                            "Save and Post",

                        icon:
                            "sap-icon://accept",

                        type:
                            "Emphasized",

                        press: function () {
                            this._oConfirmSalesOrderDialog.close();

                            this._executeCreateSalesOrder()
                                .catch(function () {
                                    /*
                                     * Error messaging is handled
                                     * in _executeCreateSalesOrder.
                                     */
                                });
                        }.bind(this)
                    })
                ],

                afterClose: function () {
                    this._removeBlackOverlayClass();
                }.bind(this)
            });

        this._oConfirmSalesOrderDialog
            .addStyleClass(
                "rep043Dialog rep043ConfirmDialog"
            );

        this.getView().addDependent(
            this._oConfirmSalesOrderDialog
        );
    }

    this._addBlackOverlayClass();
    this._oConfirmSalesOrderDialog.open();
},
onDiscardDraft: function () {
    if (!this._oSalesOrderDraftContext) {
        this._showInformationMessage(
            "No saved draft is available to discard."
        );

        return;
    }

    if (!this._oDiscardDraftDialog) {
        this._oDiscardDraftDialog =
            new Dialog({
                title:
                    "Discard saved draft?",

                contentWidth:
                    "28rem",

                draggable:
                    false,

                resizable:
                    false,

                stretch:
                    false,

                verticalScrolling:
                    false,

                horizontalScrolling:
                    false,

                content: [
                    new HBox({
                        width:
                            "100%",

                        alignItems:
                            "Start",

                        items: [
                            new Icon({
                                src:
                                    "sap-icon://warning",

                                size:
                                    "1.5rem",

                                color:
                                    "#e9730c",

                                decorative:
                                    false,

                                tooltip:
                                    "Warning"
                            }).addStyleClass(
                                "rep043DialogIcon"
                            ),

                            new VBox({
                                width:
                                    "100%",

                                items: [
                                    new Text({
                                        text:
                                            "Discard all saved draft changes?",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogLead"
                                    ),

                                    new Text({
                                        text:
                                            "The saved quantity, dates, customer PO number and other draft changes will be deleted. The latest quotation values will be loaded again.",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogDescription"
                                    )
                                ]
                            })
                        ]
                    }).addStyleClass(
                        "rep043DialogBody"
                    )
                ],

                buttons: [
                    new Button({
                        text:
                            "Keep Draft",

                        type:
                            "Transparent",

                        press: function () {
                            this._oDiscardDraftDialog.close();
                        }.bind(this)
                    }),

                    new Button({
                        text:
                            "Discard Draft",

                        icon:
                            "sap-icon://delete",

                        type:
                            "Reject",

                        press: function () {
                            this._oDiscardDraftDialog.close();
                            this._executeDiscardDraft();
                        }.bind(this)
                    })
                ],

                afterClose: function () {
                    this._removeBlackOverlayClass();
                }.bind(this)
            });

        this._oDiscardDraftDialog
            .addStyleClass(
                "rep043Dialog rep043DiscardDialog"
            );

        this.getView().addDependent(
            this._oDiscardDraftDialog
        );
    }

    this._addBlackOverlayClass();
    this._oDiscardDraftDialog.open();
},

_executeDiscardDraft: function () {
    var oQuotationODataModel =
        this.getOwnerComponent().getModel(
            "quotationOData"
        );

    var oSelectedQuotationModel =
        this.getView().getModel(
            "selectedQuotation"
        );

    var oDraftContext =
        this._oSalesOrderDraftContext;

    if (
    !oQuotationODataModel ||
    !oSelectedQuotationModel ||
    !oDraftContext
) {
    this._showErrorMessage(
        "No saved draft is available to discard.",
        "Draft could not be discarded"
    );

    return;
}

    var sQuotationNumber =
        oSelectedQuotationModel.getProperty(
            "/qNumber"
        ) || "";

    /*
     * Exact bound action name from $metadata:
     *
     * <Action Name="Discard" IsBound="true">
     *
     * DraftRoot annotation:
     *
     * com.sap.gateway.srvd_a2x.
     * zebill_adhoc_sales_srv.v0001.Discard
     */
    var sDiscardActionName =
        "com.sap.gateway.srvd_a2x." +
        "zebill_adhoc_sales_srv.v0001." +
        "Discard(...)";

    console.log(
        "REP043 invoking RAP Discard action:",
        {
            action:
                sDiscardActionName,

            draftPath:
                oDraftContext.getPath(),

            preparationUUID:
                oSelectedQuotationModel.getProperty(
                    "/preparationUUID"
                ),

            isActiveEntity:
                oDraftContext.getProperty(
                    "IsActiveEntity"
                )
        }
    );

    /*
     * Bind the action relative to the existing
     * inactive draft context.
     *
     * Do not prepend oDraftContext.getPath().
     * Do not use SAP__self.
     * Do not use Context.delete().
     */
    var oDiscardActionBinding =
        oQuotationODataModel.bindContext(
            sDiscardActionName,
            oDraftContext
        );

    this.getView().setBusy(true);

    oDiscardActionBinding.invoke("$auto")
        .then(function () {
            this._oSalesOrderDraftContext =
                null;

            this._aSalesOrderDraftItemContexts =
                [];

            this._bSalesOrderDraftSaved =
                false;

            /*
             * Reload normal quotation values.
             *
             * Example:
             * Draft quantity 2 is removed.
             * Remaining quantity 19 is loaded.
             */
            this._loadNormalQuotationValues(
                sQuotationNumber
            );

            console.log(
                "REP043 RAP draft discarded successfully:",
                {
                    quotationNumber:
                        sQuotationNumber
                }
            );

           this._showSuccessMessage(
    "Draft discarded. Current quotation values have been restored."
);
        }.bind(this))
        .catch(function (oError) {
            console.error(
                "REP043 Discard Draft failed:",
                oError
            );

            var sErrorMessage =
                "Draft could not be discarded.";

            if (
                oError &&
                oError.message
            ) {
                sErrorMessage =
                    oError.message;
            }

            MessageToast.show(
                sErrorMessage
            );
        })
        .finally(function () {
            this.getView().setBusy(false);
        }.bind(this));
},
_updateBuyerReferenceVisibility: function () {
    var oSelectedQuotationModel =
        this.getView().getModel(
            "selectedQuotation"
        );

    var oUiModel =
        this.getView().getModel(
            "uiModel"
        );

    var oBuyerReferenceVBox =
        this.byId(
            "buyerReferenceVBox"
        );

    if (
        !oSelectedQuotationModel ||
        !oUiModel ||
        !oBuyerReferenceVBox
    ) {
        return;
    }

    var sCountryCode =
        String(
            oSelectedQuotationModel.getProperty(
                "/countryCode"
            ) || ""
        ).trim().toUpperCase();

    var bServiceDetailsVisible =
        Boolean(
            oUiModel.getProperty(
                "/serviceDetailsVisible"
            )
        );

    var bBuyerReferenceVisible =
        sCountryCode === "BE" &&
        bServiceDetailsVisible;

    /*
     * Keep the normalized country and Boolean
     * in the JSON model as well.
     */
    oSelectedQuotationModel.setProperty(
        "/countryCode",
        sCountryCode
    );

    oSelectedQuotationModel.setProperty(
        "/buyerReferenceVisible",
        bBuyerReferenceVisible
    );

    /*
     * Directly control the UI element.
     *
     * This avoids relying only on XML binding
     * for the country-specific visibility rule.
     */
    oBuyerReferenceVBox.setVisible(
        bBuyerReferenceVisible
    );

    /*
     * Clear Buyer Reference for Italy and all
     * other non-Belgium countries.
     */
    if (sCountryCode !== "BE") {
        oSelectedQuotationModel.setProperty(
            "/buyerReference",
            ""
        );
    }
},
        formatAttachmentsTitle: function (a) { return "Attachments (" + (Array.isArray(a) ? a.length : 0) + ")"; },
        onToggleCustomerDetails: function () { this._toggleVisibility("/customerDetailsVisible"); },
        onToggleServiceDetails: function () {
    this._toggleVisibility(
        "/serviceDetailsVisible"
    );

    this._updateBuyerReferenceVisibility();
},
        onToggleAttachments: function () { this._toggleVisibility("/attachmentsVisible"); },
        _toggleVisibility: function (s) { var m = this.getView().getModel("uiModel"); m.setProperty(s, !m.getProperty(s)); },
        formatEyeIcon: function (b) { return b ? "sap-icon://hide" : "sap-icon://show"; },
        onShipToChange: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }
            var s = oItem.getText();
            var c = oItem.getBindingContext("selectedQuotation");
            if (c && c.getProperty("addressId")) { s += " - Address ID: " + c.getProperty("addressId"); }
            this.getView().getModel("uiModel").setProperty("/selectedShipToKey", oItem.getKey());
            this.getView().getModel("uiModel").setProperty("/selectedShipToAddress", s);
        },
        onAttachmentFileChange: function (oEvent) {
            var a = oEvent.getParameter("files");
            this.getView().getModel("uiModel").setProperty("/selectedAttachmentName", a && a[0] ? a[0].name : oEvent.getParameter("newValue") || "");
        },
        onUploadAttachment: function () { MessageToast.show("Attachment persistence is not implemented yet."); },
        onDeleteAttachment: function () { MessageToast.show("Attachment persistence is not implemented yet."); },
        onPreviewAttachment: function () { MessageToast.show("Attachment preview is not implemented yet."); },

        onNavBack: function () {
            if (this._bSalesOrderSaved || this._bSalesOrderDraftSaved) {
                this._goBackToQuotationList();
                return;
            }
            this._openUnsavedChangesDialog();
        },
_openUnsavedChangesDialog: function () {
    if (!this._oUnsavedChangesDialog) {
        this._oUnsavedChangesDialog =
            new Dialog({
                title:
                    "Leave without saving?",

                contentWidth:
                    "28rem",

                draggable:
                    false,

                resizable:
                    false,

                stretch:
                    false,

                verticalScrolling:
                    false,

                horizontalScrolling:
                    false,

                content: [
                    new HBox({
                        width:
                            "100%",

                        alignItems:
                            "Start",

                        items: [
                            new Icon({
                                src:
                                    "sap-icon://warning",

                                size:
                                    "1.5rem",

                                color:
                                    "#e9730c",

                                decorative:
                                    false,

                                tooltip:
                                    "Warning"
                            }).addStyleClass(
                                "rep043DialogIcon"
                            ),

                            new VBox({
                                width:
                                    "100%",

                                items: [
                                    new Text({
                                        text:
                                            "Your latest changes have not been saved.",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogLead"
                                    ),

                                    new Text({
                                        text:
                                            "If you leave this screen now, the information entered since the last save will be lost.",

                                        wrapping:
                                            true
                                    }).addStyleClass(
                                        "rep043DialogDescription"
                                    )
                                ]
                            })
                        ]
                    }).addStyleClass(
                        "rep043DialogBody"
                    )
                ],

                buttons: [
                    new Button({
                        text:
                            "Stay on Page",

                        type:
                            "Emphasized",

                        press: function () {
                            this._oUnsavedChangesDialog.close();
                        }.bind(this)
                    }),

                    new Button({
                        text:
                            "Leave without Saving",

                        type:
                            "Transparent",

                        press: function () {
                            this._oUnsavedChangesDialog.close();
                            this._goBackToQuotationList();
                        }.bind(this)
                    })
                ],

                afterClose: function () {
                    this._removeBlackOverlayClass();
                }.bind(this)
            });

        this._oUnsavedChangesDialog
            .addStyleClass(
                "rep043Dialog rep043UnsavedDialog"
            );

        this.getView().addDependent(
            this._oUnsavedChangesDialog
        );
    }

    this._addBlackOverlayClass();
    this._oUnsavedChangesDialog.open();
},
        _addBlackOverlayClass: function () { document.body.classList.add("blackDialogOverlayActive"); },
        _removeBlackOverlayClass: function () { document.body.classList.remove("blackDialogOverlayActive"); },
        _goBackToQuotationList: function () { this.getOwnerComponent().getRouter().navTo("RouteView1"); }
    });
});

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
"sap/m/MessageBox"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend("zo2c_rep043.controller.View1", {
onInit: function () {
    /*
     * quotationModel must always start empty.
     * Real quotations will be loaded from DSE-110.
     */
    var oQuotationModel =
        this.getOwnerComponent().getModel(
            "quotationModel"
        );

    if (oQuotationModel) {
        oQuotationModel.setData({
            quotations: []
        });
    } else {
        console.error(
            "REP043 quotation JSON model is not available."
        );
    }

    var oQuotationODataModel =
        this.getOwnerComponent().getModel(
            "quotationOData"
        );

    if (oQuotationODataModel) {
        console.log(
            "REP043 quotation OData model loaded:",
            oQuotationODataModel
        );
    } else {
        console.error(
            "REP043 quotation OData model is not available."
        );
    }

    /*
     * Customer filter also starts empty.
     */
    var oCustomerFilterModel =
        new JSONModel({
            selectedCustomerKey: "",
            customers: []
        });

    this.getView().setModel(
        oCustomerFilterModel,
        "customerFilterModel"
    );

    /*
     * Load only real backend quotations.
     */
    this._loadQuotationsFromBackend();

    this.getView().addEventDelegate({
        onAfterShow: function () {
            this._applyQuotationFilters();
        }.bind(this)
    });
},

_loadQuotationsFromBackend: function () {
    var oQuotationODataModel =
        this.getOwnerComponent().getModel(
            "quotationOData"
        );

    var oQuotationModel =
        this.getOwnerComponent().getModel(
            "quotationModel"
        );

    var oCustomerFilterModel =
        this.getView().getModel(
            "customerFilterModel"
        );

    if (
        !oQuotationODataModel ||
        !oQuotationModel
    ) {
        if (oQuotationModel) {
            oQuotationModel.setProperty(
                "/quotations",
                []
            );
        }

        if (oCustomerFilterModel) {
            oCustomerFilterModel.setProperty(
                "/customers",
                []
            );

            oCustomerFilterModel.setProperty(
                "/selectedCustomerKey",
                ""
            );
        }

        MessageToast.show(
            "Quotation service model is not available."
        );

        return;
    }

    /*
     * Clear old or mock data before requesting
     * the latest DSE-110 quotations.
     */
    oQuotationModel.setProperty(
        "/quotations",
        []
    );

    if (oCustomerFilterModel) {
        oCustomerFilterModel.setProperty(
            "/customers",
            []
        );

        oCustomerFilterModel.setProperty(
            "/selectedCustomerKey",
            ""
        );
    }

    /*
     * Keep the screen busy while backend data loads.
     */
    this.getView().setBusy(true);

    var oListBinding =
        oQuotationODataModel.bindList(
            "/Quotations",
            null,
            null,
            null,
            {
          $select: [
    "QuotationNumber",
    "QuotationType",
    "CountryCode",
    "PostingDate",
    "SoldToCustomer",
                    "SoldToCustomerName",
                    "SoldToAddressID",
                    "BillToCustomer",
                    "BillToCustomerName",
                    "BillToAddressID",
                    "ShipToCustomer",
                    "ShipToCustomerName",
                    "ShipToAddressID",
                    "SalesOrganization",
                    "DistributionChannel",
                    "OrganizationDivision",
                    "CustomerPONumber",
                    "QuotationDate",
                    "ValidFrom",
                    "ValidTo",
                    "TotalNetAmount",
                    "Currency",
                    "CreationDate",
                    "ApprovalStatus",
                    "OverallProcessStatus",
                    "OverallReferenceStatus",
                    "OverallRejectionStatus"
                ].join(",")
            }
        );

    oListBinding.requestContexts(
        0,
        500
    )
        .then(function (aContexts) {
            var aBackendQuotations =
                aContexts.map(function (oContext) {
                    return this._mapBackendQuotation(
                        oContext.getObject()
                    );
                }.bind(this));

            /*
             * Store only real DSE-110 quotation data.
             */
            oQuotationModel.setProperty(
                "/quotations",
                aBackendQuotations
            );

            var aBackendCustomers =
                this._buildCustomersFromQuotations(
                    aBackendQuotations
                );

            if (oCustomerFilterModel) {
                oCustomerFilterModel.setProperty(
                    "/customers",
                    aBackendCustomers
                );

                oCustomerFilterModel.setProperty(
                    "/selectedCustomerKey",
                    ""
                );
            }

            /*
             * Remove any previous table selection.
             */
            this._clearQuotationSelection();

            /*
             * Reapply empty/current filter values to
             * the newly loaded quotations.
             */
            this._applyQuotationFilters();

            console.log(
                "REP043 backend quotations loaded:",
                aBackendQuotations
            );

            console.log(
                "REP043 backend customers created:",
                aBackendCustomers
            );

            if (aBackendQuotations.length === 0) {
                MessageToast.show(
                    "No quotations were returned by the backend."
                );

                return;
            }

            MessageToast.show(
                aBackendQuotations.length +
                " quotation(s) loaded"
            );
        }.bind(this))
        .catch(function (oError) {
            console.error(
                "REP043 quotation loading failed:",
                oError
            );

            /*
             * Never retain mock or stale quotations
             * after a backend loading failure.
             */
            oQuotationModel.setProperty(
                "/quotations",
                []
            );

            if (oCustomerFilterModel) {
                oCustomerFilterModel.setProperty(
                    "/customers",
                    []
                );

                oCustomerFilterModel.setProperty(
                    "/selectedCustomerKey",
                    ""
                );
            }

            this._clearQuotationSelection();

MessageBox.error(
    "The quotation list could not be loaded from the backend. Please refresh the application or try again later.",
    {
        title:
            "Unable to load quotations",

        styleClass:
            "rep043MessageBox"
    }
);
        }.bind(this))
        .finally(function () {
            this.getView().setBusy(false);
        }.bind(this));
},

_mapBackendQuotation: function (
    oBackendQuotation
) {
    var sSoldToDisplay = [
        oBackendQuotation.SoldToCustomer,
        oBackendQuotation.SoldToCustomerName
    ].filter(Boolean).join(" - ");

    var sBillToDisplay = [
        oBackendQuotation.BillToCustomer,
        oBackendQuotation.BillToCustomerName
    ].filter(Boolean).join(" - ");

    var sShipToDisplay = [
        oBackendQuotation.ShipToCustomer,
        oBackendQuotation.ShipToCustomerName
    ].filter(Boolean).join(" - ");

    var aShipToOptions = [];

    if (
        oBackendQuotation.ShipToCustomer ||
        oBackendQuotation.ShipToCustomerName
    ) {
        aShipToOptions.push({
            key:
                oBackendQuotation.ShipToCustomer ||
                "SHIP_TO_1",

            text:
                sShipToDisplay ||
                oBackendQuotation.ShipToCustomerName ||
                oBackendQuotation.ShipToCustomer,

            addressId:
                oBackendQuotation.ShipToAddressID || ""
        });
    }

    return {
        /* Quotation List */

        qNumber:
            oBackendQuotation.QuotationNumber || "",

quotationType:
    oBackendQuotation.QuotationType || "",

countryCode:
    String(
        oBackendQuotation.CountryCode || ""
    ).toUpperCase(),

salesOrganization:
    oBackendQuotation.SalesOrganization || "",

distributionChannel:
    oBackendQuotation.DistributionChannel || "",

organizationDivision:
    oBackendQuotation.OrganizationDivision || "",



        customerKey:
            oBackendQuotation.SoldToCustomer || "",

        customer:
            sSoldToDisplay,

        creationDate:
            this._formatBackendDate(
                oBackendQuotation.CreationDate
            ),

        poNumber:
            oBackendQuotation.CustomerPONumber || "",

        validFrom:
            oBackendQuotation.ValidFrom || "",

        validTo:
            oBackendQuotation.ValidTo || "",

        validityDate:
            this._formatBackendDate(
                oBackendQuotation.ValidTo
            ),

        totalValue:
            Number(
                oBackendQuotation.TotalNetAmount
            ) || 0,

        currency:
            oBackendQuotation.Currency || "",

        approvalStatusCode:
            oBackendQuotation.ApprovalStatus || "",

        approvalStatus:
            this._getApprovalStatusText(
                oBackendQuotation.ApprovalStatus
            ),

        statusState:
            this._getApprovalStatusState(
                oBackendQuotation.ApprovalStatus
            ),

        overallProcessStatus:
            oBackendQuotation.OverallProcessStatus || "",

        overallReferenceStatus:
            oBackendQuotation.OverallReferenceStatus || "",

        overallRejectionStatus:
            oBackendQuotation.OverallRejectionStatus || "",

   

        date:
            this._formatBackendDate(
                oBackendQuotation.QuotationDate
            ),

        /* Sold-To */

        soldToCustomer:
            sSoldToDisplay,

        soldToCustomerNumber:
            oBackendQuotation.SoldToCustomer || "",

        soldToName:
            oBackendQuotation.SoldToCustomerName || "",

        soldToAddressId:
            oBackendQuotation.SoldToAddressID || "",

        soldToAddress:
            oBackendQuotation.SoldToAddressID
                ? "Address ID: " +
                    oBackendQuotation.SoldToAddressID
                : "",

        soldToCity: "",

        soldToVat: "",

        /* Bill-To */

        billToCustomer:
            sBillToDisplay,

        billToCustomerNumber:
            oBackendQuotation.BillToCustomer || "",

        billToName:
            oBackendQuotation.BillToCustomerName || "",

        billToAddressId:
            oBackendQuotation.BillToAddressID || "",

        billToAddress:
            oBackendQuotation.BillToAddressID
                ? "Address ID: " +
                    oBackendQuotation.BillToAddressID
                : "",

        billToCity: "",

        billToVat: "",

        /* Ship-To */

        shipToCustomer:
            sShipToDisplay,

        shipToCustomerNumber:
            oBackendQuotation.ShipToCustomer || "",

        shipToName:
            oBackendQuotation.ShipToCustomerName || "",

        shipToAddressId:
            oBackendQuotation.ShipToAddressID || "",

        shipToOptions:
            aShipToOptions,

        /* Header Details */

        contactEmail: "",

        profitCenter: "",

        projectNumber: "",

        projectDescription: "",

        showEpmContract: false,

        epmContract: "",

        /* Editable Screen 2 Fields */

        additionalInfo: "",

        serviceDateFrom: "",

        serviceDateTo: "",

/*
 * Posting Date initially comes from VBAK-PSM_BUDAT.
 */
postingDate:
    oBackendQuotation.PostingDate
        ? String(
            oBackendQuotation.PostingDate
        ).substring(
            0,
            10
        )
        : "",

/*
 * Keep the original backend Posting Date separately.
 *
 * When a saved draft is discarded, Screen 2 must return
 * to this value instead of keeping the discarded draft date.
 */
originalPostingDate:
    oBackendQuotation.PostingDate
        ? String(
            oBackendQuotation.PostingDate
        ).substring(
            0,
            10
        )
        : "",

        eventName: "",

        customerPoNum:
            oBackendQuotation.CustomerPONumber || "",

        buyerReference: "",

        additionalNotes: "",

        /* Collections */

        attachments: [],

        items: [],

        totals: []
    };
},
    

_getApprovalStatusText: function (
    sApprovalStatus
) {
    switch (sApprovalStatus) {
        case "":
        case null:
        case undefined:
            return "Not Relevant";

        case "A":
            return "In Approval";

        case "B":
            return "Released";

        case "C":
            return "Rejected";

        case "D":
            return "To Be Reworked";

        default:
            return "Unknown";
    }
},

_getApprovalStatusState: function (
    sApprovalStatus
) {
    switch (sApprovalStatus) {
        case "A":
            return "Warning";

        case "B":
            return "Success";

        case "C":
            return "Error";

        case "D":
            return "Warning";

        case "":
        case null:
        case undefined:
        default:
            return "None";
    }
},

_buildCustomersFromQuotations: function (
    aQuotations
) {
    var mUniqueCustomers = {};

    aQuotations.forEach(function (oQuotation) {
        if (!oQuotation.customerKey) {
            return;
        }

        if (
            !mUniqueCustomers[
                oQuotation.customerKey
            ]
        ) {
            mUniqueCustomers[
                oQuotation.customerKey
            ] = {
                key:
                    oQuotation.customerKey,

                text:
                    oQuotation.customer
            };
        }
    });

    return Object.keys(mUniqueCustomers)
        .map(function (sCustomerKey) {
            return mUniqueCustomers[
                sCustomerKey
            ];
        })
        .sort(function (
            oCustomerA,
            oCustomerB
        ) {
            return oCustomerA.text.localeCompare(
                oCustomerB.text
            );
        });
},

_formatBackendDate: function (vDate) {
    if (!vDate) {
        return "";
    }

    var sDate =
        String(vDate).substring(0, 10);

    var aDateParts =
        sDate.split("-");

    if (aDateParts.length !== 3) {
        return sDate;
    }

    return (
        aDateParts[2] +
        "/" +
        aDateParts[1] +
        "/" +
        aDateParts[0]
    );
},

onCustomerFilterChange: function () {
    this._applyQuotationFilters();
    this._clearQuotationSelection();
},

onQuotationFilterChange: function () {
    this._applyQuotationFilters();
    this._clearQuotationSelection();
},

_applyQuotationFilters: function () {
    var oTable =
        this.byId("quotationTable");

    var oBinding =
        oTable.getBinding("items");

    if (!oBinding) {
        return;
    }

    var oCustomerFilterModel =
        this.getView().getModel(
            "customerFilterModel"
        );

    var sSelectedCustomerKey =
        oCustomerFilterModel.getProperty(
            "/selectedCustomerKey"
        ) || "";

    var sSoldToSearch =
        (
            this.byId(
                "view1SoldToPartySearch"
            ).getValue() || ""
        ).trim();

    var sPoNumberSearch =
        (
            this.byId(
                "view1PoNumberSearch"
            ).getValue() || ""
        ).trim();

    var aFilters = [];

    if (sSelectedCustomerKey) {
        aFilters.push(
            new Filter(
                "customerKey",
                FilterOperator.EQ,
                sSelectedCustomerKey
            )
        );
    }

    if (sSoldToSearch) {
        aFilters.push(
            new Filter({
                filters: [
                    new Filter(
                        "customerKey",
                        FilterOperator.Contains,
                        sSoldToSearch
                    ),
                    new Filter(
                        "customer",
                        FilterOperator.Contains,
                        sSoldToSearch
                    )
                ],
                and: false
            })
        );
    }

    if (sPoNumberSearch) {
        aFilters.push(
            new Filter(
                "poNumber",
                FilterOperator.Contains,
                sPoNumberSearch
            )
        );
    }

    oBinding.filter(aFilters);
},

_clearQuotationSelection: function () {
    var oTable =
        this.byId("quotationTable");

    var oCreateButton =
        this.byId(
            "view1CreateSalesOrderButton"
        );

    if (oTable) {
        oTable.removeSelections(true);
    }

    if (oCreateButton) {
        oCreateButton.setEnabled(false);
    }
},

        onQuotationSelectionChange: function () {
            var oTable = this.byId("quotationTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oCreateButton = this.byId("view1CreateSalesOrderButton");

            oCreateButton.setEnabled(aSelectedItems.length === 1);
        },

        onCreateSalesOrder: function () {
            var oTable = this.byId("quotationTable");
            var aSelectedItems = oTable.getSelectedItems();

            if (aSelectedItems.length === 0) {
                MessageToast.show("Please select one quotation first.");
                return;
            }

            if (aSelectedItems.length > 1) {
                MessageToast.show("Please select only one quotation to create sales order.");
                return;
            }

            var oSelectedItem = aSelectedItems[0];
            var oContext = oSelectedItem.getBindingContext("quotationModel");

            if (!oContext) {
                MessageToast.show("Selected quotation data not found.");
                return;
            }

            var sQuotation = oContext.getProperty("qNumber");

            if (!sQuotation) {
                MessageToast.show("Quotation number not found.");
                return;
            }

            this.getOwnerComponent()
                .getRouter()
                .navTo("RouteSalesOrder", {
                    qNumber: sQuotation
                });
        },



        
        

    });
});